# Tile Bridge（A1）

服务默认启用，仅绑定 `127.0.0.1:18923`。在“设置 → 磁贴桥接”关闭或重新启用，开关写入 settings.json 并跨重启保留。旧配置缺少 tileBridgeEnabled 时默认为 true。界面区分配置启用和实际运行；端口被占用时显示错误，可释放端口后重试。

## 使用

先将应用固定为磁贴并开启“实时动态磁贴”。从 `%APPDATA%\win-start\tile-layout.json` 中读取该磁贴的 appId；这是扫描入口 ID，不是磁贴自身的 id，也不一定等于软件名称。将下例 appId 替换成实际值：

```powershell
$payload = @{ appId = '实际的 appId'; title = '新消息'; body = '收到一条通知'; count = 3 } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:18923/api/tile/update' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($payload))

$clear = @{ appId = '实际的 appId' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://127.0.0.1:18923/api/tile/clear' -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($clear))
```

update 必填 appId，可选 title、body、icon、count。每次替换该 appId 的整个记录，省略的字段清空；timestamp 由服务生成。count 是非负 32 位整数，0 不显示角标，超过 99 显示 99+。icon 仅接受带 PNG 签名的 `data:image/png;base64,...`，不加载远程 URL。正文和标题作为文本显示。

clear 仅接受 appId，清除不存在的 ID 也返回成功。成功返回 `{"success":true}`，错误返回非 2xx 状态及 `{"success":false,"error":"原因"}`。200 表示服务已接收并更新缓存，不表示当前一定有匹配磁贴；未固定或未启用动态内容的磁贴不会展示。

内容仅保留在当前进程内存中，窗口重载会从后端恢复；关闭服务清空内容，退出程序也不保留。推送不写磁贴布局、不启动应用、不改变固定状态。后台隐藏时也可接收，显示菜单后读取当前内容。

## 请求边界与生命周期

使用本机脚本直接访问上述 IP 地址，Host 必须为 `127.0.0.1:18923`。服务拒绝带 Origin 的浏览器请求，不开放 CORS；只支持 POST 与 application/json。未知接口返回 404、错误方法 405、类型不符 415、无效 JSON/字段 400、超大请求 413、缓存满 429。

请求体最多 64 KiB，appId 最多 1024 字节、title 最多 512 字节、body 最多 8192 字节。缓存最多 128 个 appId；到上限后可更新既有入口或先 clear。最多处理 16 个并发连接，单连接总时限 3 秒，HTTP 处理使用 Hyper。服务无需令牌；本机进程可推送，服务不提供网络远程访问或程序执行接口。

前端先完成事件订阅，再获取初始快照；修订号阻止较晚返回的旧快照覆盖新通知。停服会终止连接、释放端口并广播空快照；退出时显式结束服务线程。

## 验证

新增 5 项 Rust 测试，包括真实回环 HTTP 请求、内容更新与清除、事件失败不提交、字段及容量校验、端口占用/重试/释放。HTTP 测试使用临时端口，不启动用户程序。新增 2 项桥接测试及 1 项 store 测试，覆盖订阅后恢复、卸载后抑制晚到结果、命令参数及快照顺序。

当前合计 45 项 Rust、19 项数据保护、12 项桥接、5 项生命周期测试。桌面仍需验收设置开关与重启保持、标题/正文/PNG/角标及动态翻转、隐藏期间推送和窗口重载恢复；未启动完整桌面程序验证。
