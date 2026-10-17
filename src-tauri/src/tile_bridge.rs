use http_body_util::{BodyExt, Full, Limited};
use hyper::{
    body::{Bytes, Incoming},
    service::service_fn,
    Request, Response, StatusCode,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    convert::Infallible,
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::Duration,
};

const MAX_BODY: usize = 64 * 1024;
const MAX_ENTRIES: usize = 128;
pub const ADDRESS: &str = "127.0.0.1:18923";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TileData {
    pub app_id: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub icon: Option<String>,
    pub count: Option<u32>,
    #[serde(default)]
    pub timestamp: u64,
}

#[derive(Clone, Default, Serialize)]
pub struct Snapshot {
    pub revision: u64,
    pub entries: BTreeMap<String, TileData>,
}

#[derive(Clone, Serialize)]
pub struct Status {
    pub enabled: bool,
    pub running: bool,
    pub address: &'static str,
    pub error: Option<String>,
}

type Publish = Arc<dyn Fn(&Snapshot) -> Result<(), String> + Send + Sync>;
struct Running {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
}
pub struct Service {
    running: Option<Running>,
    enabled: bool,
    error: Option<String>,
    snapshot: Arc<Mutex<Snapshot>>,
    publish: Publish,
}

impl Service {
    pub fn new(publish: Publish) -> Self {
        Self {
            running: None,
            enabled: false,
            error: None,
            snapshot: Arc::new(Mutex::new(Snapshot::default())),
            publish,
        }
    }
    pub fn status(&self) -> Status {
        let running = self
            .running
            .as_ref()
            .map(|r| !r.thread.is_finished())
            .unwrap_or(false);
        Status {
            enabled: self.enabled,
            running,
            address: ADDRESS,
            error: self
                .error
                .clone()
                .or_else(|| (self.enabled && !running).then(|| "服务未运行，请重试启动".into())),
        }
    }
    pub fn snapshot(&self) -> Result<Snapshot, String> {
        self.snapshot
            .lock()
            .map(|s| s.clone())
            .map_err(|_| "磁贴推送状态不可用".into())
    }
    pub fn shutdown(&mut self) {
        if let Some(running) = self.running.take() {
            running.stop.store(true, Ordering::SeqCst);
            let _ = running.thread.join();
        }
    }
    pub fn configure(&mut self, enabled: bool) -> Status {
        self.configure_on(enabled, ADDRESS)
    }
    fn configure_on(&mut self, enabled: bool, address: &str) -> Status {
        self.enabled = enabled;
        self.error = None;
        if enabled && self.status().running {
            return self.status();
        }
        self.shutdown();
        if enabled {
            match TcpListener::bind(address).and_then(|listener| {
                listener.set_nonblocking(true)?;
                Ok(listener)
            }) {
                Ok(listener) => {
                    let stop = Arc::new(AtomicBool::new(false));
                    let shutdown = stop.clone();
                    let snapshot = self.snapshot.clone();
                    let publish = self.publish.clone();
                    // Construct the reactor before reporting a running service.
                    match tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                    {
                        Ok(runtime) => {
                            let thread = std::thread::spawn(move || {
                                runtime.block_on(serve(listener, shutdown, snapshot, publish))
                            });
                            self.running = Some(Running { stop, thread });
                        }
                        Err(error) => self.error = Some(error.to_string()),
                    }
                }
                Err(error) => self.error = Some(format!("无法监听 {ADDRESS}：{error}")),
            }
        } else {
            if let Ok(mut snapshot) = self.snapshot.lock() {
                snapshot.revision += 1;
                snapshot.entries.clear();
                if let Err(error) = (self.publish)(&snapshot) {
                    self.error = Some(error);
                }
            }
        }
        self.status()
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.shutdown();
    }
}

async fn serve(
    listener: TcpListener,
    stop: Arc<AtomicBool>,
    snapshot: Arc<Mutex<Snapshot>>,
    publish: Publish,
) {
    let Ok(listener) = tokio::net::TcpListener::from_std(listener) else {
        return;
    };
    let mut tasks = tokio::task::JoinSet::new();
    while !stop.load(Ordering::SeqCst) {
        while tasks.try_join_next().is_some() {}
        let accepted = tokio::time::timeout(Duration::from_millis(50), listener.accept()).await;
        if matches!(accepted, Ok(Err(_))) {
            break;
        }
        if let Ok(Ok((stream, _))) = accepted {
            if tasks.len() >= 16 {
                continue;
            }
            let snapshot = snapshot.clone();
            let publish = publish.clone();
            tasks.spawn(async move {
                let handler =
                    service_fn(move |request| handle(request, snapshot.clone(), publish.clone()));
                let connection = hyper::server::conn::http1::Builder::new()
                    .keep_alive(false)
                    .max_buf_size(8192)
                    .serve_connection(hyper_util::rt::TokioIo::new(stream), handler);
                let _ = tokio::time::timeout(Duration::from_secs(3), connection).await;
            });
        }
    }
    tasks.abort_all();
    // Drop cancels connections before the reactor and listener are released.
}

fn response(status: StatusCode, message: &str) -> Response<Full<Bytes>> {
    let body = if status == StatusCode::OK {
        serde_json::json!({"success": true})
    } else {
        serde_json::json!({"success": false, "error": message})
    };
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .header("Cache-Control", "no-store")
        .header("Connection", "close")
        .body(Full::new(Bytes::from(body.to_string())))
        .unwrap()
}

fn validate(data: &TileData) -> Result<(), &'static str> {
    if data.app_id.trim().is_empty() || data.app_id.len() > 1024 {
        return Err("appId 不能为空且最多 1024 字节");
    }
    if data.title.as_ref().is_some_and(|s| s.len() > 512)
        || data.body.as_ref().is_some_and(|s| s.len() > 8192)
    {
        return Err("title 或 body 超出长度限制");
    }
    if let Some(icon) = &data.icon {
        use base64::Engine;
        let png = icon
            .strip_prefix("data:image/png;base64,")
            .ok_or("icon 仅支持 PNG data URL")?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(png)
            .map_err(|_| "icon base64 无效")?;
        if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Err("icon 不是 PNG");
        }
    }
    Ok(())
}

fn apply(
    path: &str,
    body: &[u8],
    snapshot: &Mutex<Snapshot>,
    publish: &Publish,
) -> Response<Full<Bytes>> {
    let mut data = if path == "/api/tile/clear" {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Clear {
            app_id: String,
        }
        match serde_json::from_slice::<Clear>(body) {
            Ok(clear) => TileData {
                app_id: clear.app_id,
                title: None,
                body: None,
                icon: None,
                count: None,
                timestamp: 0,
            },
            Err(_) => return response(StatusCode::BAD_REQUEST, "无效的 clear JSON"),
        }
    } else {
        match serde_json::from_slice::<TileData>(body) {
            Ok(data) => data,
            Err(_) => return response(StatusCode::BAD_REQUEST, "无效的 update JSON"),
        }
    };
    if let Err(error) = validate(&data) {
        return response(StatusCode::BAD_REQUEST, error);
    }
    data.timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let Ok(mut state) = snapshot.lock() else {
        return response(StatusCode::INTERNAL_SERVER_ERROR, "推送状态不可用");
    };
    if path == "/api/tile/update"
        && !state.entries.contains_key(&data.app_id)
        && state.entries.len() >= MAX_ENTRIES
    {
        return response(
            StatusCode::TOO_MANY_REQUESTS,
            "推送入口已达上限，请先清除旧入口",
        );
    }
    let mut next = state.clone();
    if path == "/api/tile/clear" {
        next.entries.remove(&data.app_id);
    } else {
        next.entries.insert(data.app_id.clone(), data);
    }
    next.revision += 1;
    if let Err(error) = publish(&next) {
        return response(StatusCode::INTERNAL_SERVER_ERROR, &error);
    }
    *state = next;
    response(StatusCode::OK, "")
}

async fn handle(
    request: Request<Incoming>,
    snapshot: Arc<Mutex<Snapshot>>,
    publish: Publish,
) -> Result<Response<Full<Bytes>>, Infallible> {
    let headers = request.headers();
    // Local scripts are supported; browser-origin requests and DNS aliases are not.
    if headers.contains_key("origin")
        || headers.get("host").and_then(|v| v.to_str().ok()) != Some(ADDRESS)
    {
        return Ok(response(
            StatusCode::FORBIDDEN,
            "仅接受直接访问本机地址的脚本请求",
        ));
    }
    let path = request.uri().path().to_owned();
    if !matches!(path.as_str(), "/api/tile/update" | "/api/tile/clear") {
        return Ok(response(StatusCode::NOT_FOUND, "接口不存在"));
    }
    if request.method() != hyper::Method::POST {
        return Ok(response(StatusCode::METHOD_NOT_ALLOWED, "仅支持 POST"));
    }
    let content_type = headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim();
    if !content_type.eq_ignore_ascii_case("application/json") {
        return Ok(response(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "需要 application/json",
        ));
    }
    let body = match Limited::new(request.into_body(), MAX_BODY).collect().await {
        Ok(body) => body.to_bytes(),
        Err(_) => {
            return Ok(response(
                StatusCode::PAYLOAD_TOO_LARGE,
                "请求体无效或超过 64 KiB",
            ))
        }
    };
    Ok(apply(&path, &body, &snapshot, &publish))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn noop() -> Publish {
        Arc::new(|_| Ok(()))
    }

    #[test]
    fn updates_clear_and_emit_failures_commit_only_successful_snapshots() {
        let state = Mutex::new(Snapshot::default());
        let update = br#"{"appId":"app","title":"hello","count":3}"#;
        assert_eq!(
            apply("/api/tile/update", update, &state, &noop()).status(),
            StatusCode::OK
        );
        assert_eq!(state.lock().unwrap().entries["app"].count, Some(3));
        assert!(state.lock().unwrap().entries["app"].timestamp > 0);
        let failing: Publish = Arc::new(|_| Err("emit failed".into()));
        assert_eq!(
            apply("/api/tile/clear", br#"{"appId":"app"}"#, &state, &failing).status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(state.lock().unwrap().revision, 1);
        assert_eq!(
            apply("/api/tile/clear", br#"{"appId":"app"}"#, &state, &noop()).status(),
            StatusCode::OK
        );
        assert!(state.lock().unwrap().entries.is_empty());
    }

    #[test]
    fn invalid_payloads_are_rejected_without_changes() {
        let state = Mutex::new(Snapshot::default());
        for body in [
            r#"{}"#,
            r#"{"appId":" "}"#,
            r#"{"appId":"a","count":-1}"#,
            r#"{"appId":"a","other":true}"#,
            r#"{"appId":"a","icon":"https://example.com/image.png"}"#,
            r#"{"appId":"a","icon":"data:image/png;base64,AAAA"}"#,
        ] {
            assert_eq!(
                apply("/api/tile/update", body.as_bytes(), &state, &noop()).status(),
                StatusCode::BAD_REQUEST
            );
        }
        let long = serde_json::json!({"appId":"a","body":"x".repeat(8193)}).to_string();
        assert_eq!(
            apply("/api/tile/update", long.as_bytes(), &state, &noop()).status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(state.lock().unwrap().revision, 0);
    }

    #[test]
    fn cache_is_bounded_but_existing_entries_can_update_and_clear() {
        let state = Mutex::new(Snapshot::default());
        for id in 0..MAX_ENTRIES {
            let body = serde_json::json!({"appId":id.to_string()}).to_string();
            assert_eq!(
                apply("/api/tile/update", body.as_bytes(), &state, &noop()).status(),
                StatusCode::OK
            );
        }
        assert_eq!(
            apply("/api/tile/update", br#"{"appId":"extra"}"#, &state, &noop()).status(),
            StatusCode::TOO_MANY_REQUESTS
        );
        assert_eq!(
            apply(
                "/api/tile/update",
                br#"{"appId":"0","count":1}"#,
                &state,
                &noop()
            )
            .status(),
            StatusCode::OK
        );
        apply("/api/tile/clear", br#"{"appId":"0"}"#, &state, &noop());
        assert_eq!(
            apply("/api/tile/update", br#"{"appId":"extra"}"#, &state, &noop()).status(),
            StatusCode::OK
        );
    }

    #[test]
    fn port_conflicts_report_failure_and_retry_and_disable_work() {
        let occupied = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = occupied.local_addr().unwrap().to_string();
        let mut service = Service::new(noop());
        let status = service.configure_on(true, &address);
        assert!(status.enabled && !status.running && status.error.is_some());
        drop(occupied);
        assert!(service.configure_on(true, &address).running);
        apply(
            "/api/tile/update",
            br#"{"appId":"a"}"#,
            &service.snapshot,
            &noop(),
        );
        assert!(!service.configure_on(false, &address).running);
        assert!(service.snapshot().unwrap().entries.is_empty());
        let _released = TcpListener::bind(address).unwrap();
    }

    #[test]
    fn real_http_routes_validate_origin_method_type_size_and_release_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let shutdown = stop.clone();
        let snapshot = Arc::new(Mutex::new(Snapshot::default()));
        let state = snapshot.clone();
        let thread = std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(serve(listener, shutdown, state, noop()));
        });
        let send = |method: &str, path: &str, headers: &str, body: &str| {
            let mut stream = std::net::TcpStream::connect(address).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let request = format!("{method} {path} HTTP/1.1\r\nHost: {ADDRESS}\r\nContent-Length: {}\r\n{headers}\r\n{body}", body.len());
            let _ = stream.write_all(request.as_bytes());
            let mut response = String::new();
            stream.read_to_string(&mut response).unwrap();
            response
        };
        let json = "Content-Type: application/json\r\n";
        assert!(send(
            "POST",
            "/api/tile/update",
            json,
            r#"{"appId":"test","title":"你好"}"#
        )
        .starts_with("HTTP/1.1 200"));
        assert_eq!(
            snapshot.lock().unwrap().entries["test"].title.as_deref(),
            Some("你好")
        );
        assert!(send("POST", "/api/tile/clear", json, r#"{"appId":"test"}"#)
            .starts_with("HTTP/1.1 200"));
        assert!(snapshot.lock().unwrap().entries.is_empty());
        assert!(send(
            "POST",
            "/api/tile/update",
            "Content-Type: application/json\r\nOrigin: https://example.com\r\n",
            "{}"
        )
        .starts_with("HTTP/1.1 403"));
        assert!(send("GET", "/api/tile/update", json, "").starts_with("HTTP/1.1 405"));
        assert!(send("POST", "/missing", json, "{}").starts_with("HTTP/1.1 404"));
        assert!(send(
            "POST",
            "/api/tile/update",
            "Content-Type: text/plain\r\n",
            "{}"
        )
        .starts_with("HTTP/1.1 415"));
        assert!(
            send("POST", "/api/tile/update", json, &"x".repeat(MAX_BODY + 1))
                .starts_with("HTTP/1.1 413")
        );
        stop.store(true, Ordering::SeqCst);
        thread.join().unwrap();
        let _released = TcpListener::bind(address).unwrap();
    }
}
