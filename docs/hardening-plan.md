# 隐患治理方案

> 状态：**计划**，不是已完成的实施记录。文中所有“当前行为”都来自 `master@3aaca7a` 的源码与配置；标 `inferred` 的是从代码/配置推断、尚未实测的效果。

## 1. 范围与基线

- 调查方式：只读阅读，未改动仓库，未运行构建与测试。
- 基线提交：`3aaca7a`（分支 `master`），版本 1.4.0。
- 覆盖文件：`src-tauri/src/*.rs`、`src-tauri/{Cargo.toml,tauri.conf.json,capabilities/default.json}`、`src/renderer/src/**`、`index.html`、`vite.config.ts`、`package.json`。
- 不覆盖：`launch_button.rs` 的绘制细节、`SettingsWindow.vue` 的视觉样式、NSIS 打包脚本（本轮未读全）。

分级口径：

| 级别 | 含义 |
| --- | --- |
| P0 | 会造成用户数据丢失、内存/磁盘状态分叉，或某类功能整块失效 |
| P1 | 安全边界、资源开销或明显交互退化，需要排期但不能长期拖 |
| P2 | 一致性、可维护性、产品半成品，影响后续迭代而非当下可用性 |
| P3 | 低成本清理，随手改 |

总览：

| # | 隐患 | 后果 | 级别 |
| --- | --- | --- | --- |
| 1 | 设置写入顺序“先改内存 / 先删文件” | 内存与磁盘分叉、壁纸不可回滚 | P0 |
| 2 | 配置损坏静默回默认并被覆盖 | 主题/壁纸/热区位置静默丢失 | P0 |
| 3 | 无单实例互斥 | 双热区、端口冲突、布局并发写 | P0 |
| 4 | 约 20 处 `lock().unwrap()` | 一次 panic 后设置类命令持续失败 | P0 |
| 5 | 发布版 devtools + CSP 全放开 + 特权命令 | 渲染层被控即文件读取/外联通道 | P1 |
| 6 | Tile Bridge 默认开启、无鉴权 | 本机任意进程可伪造磁贴通知 | P1 |
| 7 | 热区每秒全窗口枚举 + 强制置顶 | CPU 空转、抢 Z 序 | P1 |
| 8 | 扫描每次全量提图标无缓存 | 周期性 CPU 尖峰 | P1 |
| 9 | 磁贴几何 `76` 硬编码 6 处 | 改尺寸即拖动/裁剪错位 | P1 |
| 10 | 前端按名称去重 | 同名不同 AppID 应用被吞 | P1 |
| 11 | 用户元数据三层存储 + `pinnedApps` 死状态 | 备份丢文件夹、“已固定”区永远空 | P2 |
| 12 | 双 `windows` crate 版本 | 升级脆弱 | P2 |
| 13 | 依赖与配置漂移 | 低 | P3 |

---

## 2. P0：数据与可用性

### 2.1 设置类命令的写入顺序不一致

**现象与证据**

- 先改内存、后落盘：`set_tile_opacity`（`main.rs:820`）、`set_include_wallpaper_opacity`（`831`）、`set_theme_color`（`846`）、`set_highlight_color`（`866`）、`set_wallpaper_darken`（`945`）、`set_panel_alpha`（`961`）、`set_tile_blur`（`977`）都是“改 `s` → `save_settings(&s)?`”。
- 先落盘、后提交内存：`set_toolbar_items`（`main.rs:785`）、`set_hotkey`（`802`）。两套写法并存。
- `set_wallpaper`（`main.rs:888`）：先删所有旧扩展名壁纸（`911`），再 `fs::copy` 新文件（`916`），最后才保存设置。
- `clear_wallpaper`（`main.rs:927`）：先删文件（`933`），再保存 `None`（`939`）。

**反例**

把磁贴透明度从 0.9 调到 0.5，但磁盘不可写：命令返回错误，内存已是 0.5、文件仍是 0.9，事件还没 emit。界面显示旧值，重启后回旧值，用户以为“设置没生效”，而本次运行里实际已经按新值渲染过。

换壁纸时若复制失败（源文件被占用），旧壁纸文件已经被删除，设置仍指向已不存在的旧路径——壁纸消失且不可恢复。

**方案**

统一提交顺序，所有 setter 走同一个辅助函数（已落地，见第 9 节）：

```rust
// 先落盘再提交内存：落盘失败时内存保持旧值
fn persist_then_commit<T: Clone>(
    slot: &std::sync::Mutex<T>,
    next: T,
    persist: impl FnOnce(&T) -> Result<(), String>,
) -> Result<(), String> {
    persist(&next)?;
    *guard_or_error(slot, "设置暂不可用")? = next;
    Ok(())
}

fn persist_settings(state: &tauri::State<'_, AppSettingsState>, next: AppSettings) -> Result<(), String> {
    persist_then_commit(&state.0, next, save_settings)
}
```

壁纸改为“唯一文件名 + 先落盘后清理”，保留可回滚点：

1. 复制到 `data_dir/wallpaper-<毫秒时间戳>.<ext>`——设置里记录的路径一定存在，且不覆盖旧壁纸；
2. 保存设置成功后才清理其它 `wallpaper*` 文件；
3. 落盘失败时删除刚复制的新文件，旧壁纸与旧设置都保持原状。

`clear_wallpaper` 改为先保存 `None` 成功，再清理文件。

**实现落点**

- 新增 `commit_settings`，并替换上列 7 处的写法；
- `set_wallpaper` / `clear_wallpaper` 重排顺序；
- `storage.rs` 增加一个“复制/替换单个文件”的辅助函数，复用现有的 `MOVEFILE_WRITE_THROUGH` 语义。

**验证**

用 `layout.rs:271` 已有的手法：以 `FILE_SHARE_READ|FILE_SHARE_WRITE` 打开临时/目标文件模拟替换失败，断言：

- 失败后内存与磁盘均为旧值；
- 旧壁纸文件仍存在、设置仍指向它；
- 释放句柄后重试成功。

### 2.2 配置损坏静默降级

**现象与证据**

- `load_settings`（`main.rs:764`）：`read_to_string().ok()` + `unwrap_or_default()`，把“文件不存在 / 无权限 / JSON 损坏”三种情况统一变成默认值；下一次任意设置保存就会覆盖原文件。
- `launch_button::load_all_configs`（`launch_button.rs:109`）：同样 `unwrap_or_default()`，热区位置丢失。
- 对照 `layout.rs:167`：布局区分“不存在→空布局”与“读失败/损坏→报错保留文件”，这套标准没有推广到设置模块。

**反例**

用户手动改错一个逗号，启动后主题色/壁纸/Tile Bridge 开关全部回默认，且第一次改设置就把坏文件覆盖掉——原始配置无法找回。

**方案**

`load_settings` 返回 `(AppSettings, Option<LoadWarning>)`：

- 文件不存在：默认值，无告警；
- 解析失败：先把原文件复制为 `settings.json.corrupt-<unix_ts>`，再用默认值，并产生告警；
- 单个字段缺失仍走 `#[serde(default = ...)]`（`main.rs:748` 的兼容测试要求），只有**整体解析失败**才算损坏。

`setup` 读取后把告警存入 `StartupWarning` 状态，前端启动时调用一次性命令 `get_startup_warning` 取走，由 `BridgeErrorBanner` 显示——不依赖页面是否已加载完成，避免事件早于监听而丢失。`launch-buttons.json` 同样备份，并把原先的非原子 `fs::write` 换成 `storage::write_json_atomic`。

**验证**

写入 `{"hotkey":` 启动，断言：生成 `.corrupt-*`、前端出现告警、原文件在用户主动保存前字节不变；再断言正常配置不产生备份文件（防止误报）。

### 2.3 没有单实例约束

**现象与证据**

- `Cargo.toml` 无 `tauri-plugin-single-instance`；`run()`（`main.rs:1423`）只装 opener / dialog / autostart / global-shortcut。
- Tile Bridge 固定绑 `127.0.0.1:18923`（`tile_bridge.rs:22`、`112`），第二个实例必然 bind 失败。
- `launch_button::start`（`launch_button.rs:139`）每实例每屏建一套原生热区窗口。
- `layout.rs:9` 的 `IO_LOCK` 是进程内 `static Mutex`，跨进程无效。

**反例**

用户从桌面双击两次（或开机自启 + 手动启动同时发生）：屏幕上叠两层近乎全透明的点击层；两个进程各自读-改-写 `tile-layout.json`，三方合并只能看到“自己进程读到的 base”，后写者会把先写者的磁贴改动覆盖掉。

**候选比较**

| 方案 | 机制 | 代价 | 拒绝/采纳理由 |
| --- | --- | --- | --- |
| A. `tauri-plugin-single-instance` | 命名互斥体 + IPC，第二实例退出并回调第一实例 | 一个依赖 + 约 10 行 | 采纳：官方维护，行为最省心 |
| B. 自建 `CreateMutexW` + 查找已有窗口 | 自行实现 IPC 与唤醒 | 代码量大，需处理消息通道 | 收益与 A 相同，不做 |
| C. 不处理 | — | — | 拒绝：双写布局会静默丢磁贴 |

**方案（A）**

插件必须在 builder 最前面注册（single-instance 要求先于其它插件初始化），回调里调用 `request_menu_toggle(app, None)`，语义定为“第二次启动 = 打开开始菜单”。

**迁移与回滚**

无持久状态变更；第二实例在写任何文件前退出。若要回滚，移除插件即可，不残留状态。

**验证**

连续双击两次 exe，断言：任务管理器只有一个 `win-start.exe`；`netstat` 显示 18923 只被监听一次；第二次点击只是唤起菜单。对照组（旧行为）复现双实例写 `tile-layout.json` 丢磁贴。

### 2.4 锁毒化会让设置类命令永久失败

**现象与证据**

`state.0.lock().unwrap()` 出现约 20 处：`main.rs:361, 464, 798, 816, 823, 838, 858, 878, 919, 932, 937, 953, 969, 985, 1240, 1246, 1258, 1264, 1467, 1473`；而 `set_hotkey`（`804`）已使用 `map_err`。写法不统一。

**反例**

任一次持锁期间 panic（未来引入的 `unwrap`、字符串格式化 panic、`save_settings` 内部异常）都会毒化 `Mutex`；此后每个 `.unwrap()` 立即再 panic。表现是“设置窗口能打开，但所有开关点不动、错误提示也不出现”。

**方案**

- 写路径：`lock().map_err(|_| "设置暂不可用")?`，返回可展示的中文错误；
- 读路径（`get_settings`、`get_tile_opacity`）：`lock().unwrap_or_else(|e| e.into_inner())`，毒化后仍返回旧值并记日志——读旧值比整块不可用更安全；
- `StyleTargets`（`1264`）、`CropImagePath`（`464`）同样处理。

**验证**

测试中用 `catch_unwind` 持锁 panic 制造毒化，断言后续 `get_settings` 仍返回、`set_theme_color` 返回错误字符串而不是进程崩溃。

---

## 3. P1：安全与资源

### 3.1 特权面过大 + 发布版保留调试入口

**现象与证据**

- `tauri.conf.json:32` 显式 `"devtools": true`。
- `index.html:8`：`default-src * 'self' 'unsafe-inline' 'unsafe-eval' data: blob:`，既放开远程 `connect-src`，又允许 eval。
- 渲染层可直接调用“任意路径读 / 任意目标执行”：`read_file_base64`（`main.rs:485`）、`read_image_base64`（`1079`）、`launch_app`（`241`）、`shell_open`（`218`）。

三者组合出一条链：渲染层被控 → 读任意文件 → 借宽松 CSP 外发。现实触发概率低（磁贴推送只接受 PNG data URL、标题正文为文本插值，本轮未找到注入点），但这是“防线全靠没人利用”的设计。

**方案（成本从低到高）**

1. `devtools` 改 `false`；开发期用 `tauri dev` 或 cargo feature `devtools`。
2. CSP 用 `tauri.conf.json` 的 `app.security.csp`（生产）与 `devCsp`（开发）分开：
   - 生产：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: file:;`
   - 开发：保留 Vite HMR 需要的 `unsafe-eval` 与 `ws:`，避免开发环境崩。
3. 命令面收敛：
   - `read_file_base64` / `read_image_base64` 校验 `canonicalize()` 后必须以 `data_dir()` 为前缀；用户刚选择的壁纸/头像路径登记进临时白名单（一次性 token 或路径集合）。
   - `launch_app` 改为只接受本轮扫描产出的路径：后端用 `Mutex<HashSet<String>>` 在 `scan_apps` 时刷新，未知路径直接拒绝并提示“目标应用已不可用”。

**验证**

- `tauri build` 后确认窗口无法打开 DevTools（`inferred`：需实测 release 行为）。
- 渲染层 `fetch('https://example.com')` 被 CSP 拦截。
- 传 `C:\Windows\System32\config\SAM` 给 `read_file_base64`，断言被拒。
- 传任意 `.exe` 给 `launch_app`，断言被拒；传扫描结果里的路径则成功。

### 3.2 Tile Bridge 默认开启且无鉴权

**现象与证据**

- `AppSettings::default()` 里 `tile_bridge_enabled: true`（`main.rs:709`），`setup` 直接据此启动（`1467`）。
- 服务侧 Host / Origin 校验已做得不错（`tile_bridge.rs:298`）：无 `Origin` 且 `Host` 必须精确等于 `127.0.0.1:18923`，挡住浏览器跨域与 DNS 重绑定。
- 但没有“谁在本机”的区分，任何本机进程都能推送。

**反例**

任意本机脚本 POST `{"appId":"qq","title":"张三","body":"在吗？看到回我"}`，磁贴背面与真实 IM 通知在视觉上无法区分。

**候选比较**

| 方案 | 机制 | 迁移成本 | 结论 |
| --- | --- | --- | --- |
| A. 默认关闭（opt-in） | 改默认值，设置页保留开关并写明风险 | 旧 `settings.json` 已有该字段→保持原值；仅全新安装变关 | 先做 |
| B. 共享令牌 | 随机 token 存设置，请求头 `Authorization: Bearer` 校验，设置页提供复制 | 脚本接入方式变更，文档同步 | 需要防伪造时再做 |
| C. 不处理 | — | — | 拒绝：等同于默认信任本机全部进程 |

A 与 B 不冲突，A 是 B 的前置。

**验证**

默认配置下 curl 打 `/api/tile/update` 应返回“服务未启动”；用户开启后同一请求成功；若做 B，无 token 返回 401、带 token 返回 200。现有 `bridge-contract` 测试（`scripts/bridge-contract.test.cjs`、`tile_bridge.rs:449`）可扩展覆盖 401 分支。

### 3.3 热区每秒全量枚举 + 每屏强制置顶

**现象与证据**

- `launch_button.rs:205`：控制器窗口 `SetTimer(h, 1, HEAL_INTERVAL_MS=1000, None)`。
- `tick_buttons`（`484`）每次都 `reconcile_buttons()` + `fullscreen_devices()`（`513`）→ `fullscreen::detect`（`fullscreen.rs:115`）→ `EnumWindows` 遍历全部可见窗口，并对每个窗口查 `DWMWA_CLOAKED` / `DWMWA_EXTENDED_FRAME_BOUNDS`（`fullscreen.rs:30`）。
- `apply_state`（`launch_button.rs:400`）对 EXSTYLE 变化已做幂等判断（`412`），但置顶那段（`442`）无条件 `SetWindowPos(HWND_TOPMOST, …)`。

**反例**

用户开着一个置顶小工具/画中画：热区每秒抢一次 Z 序，表现为层级闪烁或遮挡；空闲时也在每秒枚举全系统窗口。

**方案**

1. 置顶改为条件执行：仅当窗口不可见、或因其它置顶窗口压住而“被降层”时才重新置顶（可用 `GetWindow(hwnd, GW_HWNDPREV)` 或比较 EXSTYLE 是否被外部改动）。
2. 全屏检测从固定 1s 改为事件驱动（`install_hooks` 已挂 `EVENT_SYSTEM_FOREGROUND` / `MINIMIZEEND` / `SHOW` 等，`launch_button.rs:557`），空闲时退避到 5s；只检测前台窗口所在屏，其余屏复用上次结果。
3. `HEAL_INTERVAL_MS` 的定时器保留，但 tick 内先做廉价判断（`IsWindowVisible` / `IsIconic`），全部正常则跳过昂贵部分。

**验证**

用 `QueryPerformanceCounter` 统计 60 秒内 `EnumWindows` 与 `SetWindowPos` 的调用次数（改后应只在事件发生后增长）；同时开一个置顶记事本，确认热区不再打断其层级。CPU 占比为 `inferred`，需实测对照。

### 3.4 扫描每次全量提图标

**现象与证据**

- `scan_lnk_dir`（`scanner.rs:43`）对每个 `.lnk` 调 `extract_icon_png`（`68`）。
- `icon_extract.rs:21`：`ExtractIconExW` → `GetDIBits` → 全图像素 BGRA→RGBA 逐像素转换 → PNG 编码。
- 前端只在 60 秒节流上做文章（`useApps.ts:20`、`214`），没有图标缓存。

**反例**

开始菜单有 150 个快捷方式，每次“菜单打开且距上次扫描超过 60 秒”都会重算 150 个图标；不卡 UI（跑在 `spawn_blocking`），但周期性 CPU 尖峰明显。

**方案**

- 缓存键 `(绝对路径, mtime, size)`；
- 内存 `HashMap` + 落盘 `data_dir/icons-cache/<hash>.png`，文件名带版本前缀便于整体失效；
- `scan_lnk_dir` 只对 miss 的条目提图标，命中直接读缓存字节；
- 顺带修正 `scan_all` 的去重：`dedup_by` 只去相邻重复（`scanner.rs:188`），改为排序后构建 `HashSet` 去重。

**验证**

记录两次完整扫描耗时（改后应显著下降）；`touch` 某个 `.lnk` 后断言只有它被重新提取；删缓存目录后能自愈重建且结果与无缓存一致。

### 3.5 磁贴几何常量散落

**现象与证据**

格子边长 `76`（= 70 内容 + 6 gap）硬编码于：`TileGrid.vue:101`、`LiveTile.vue:207 / 337 / 396`、`GroupStyleWindow.vue:165 / 193 / 288`、`TileStyleWindow.vue:270`、`useTiles.ts:701`；真源在 `variables.css:27-31`。

**反例**

把 `--tile-small` 调到 80（大屏适配的自然需求）：网格按 80 排布，但拖动吸附仍按 76 反推行列、组背景裁剪仍按 76 计算输出，磁贴落点与预览框整体偏移。

**方案**

新增 `src/renderer/src/utils/grid.ts`，导出 `GRID_CELL`、`SIZE_SPAN`、`spanOf(size)`、`cellRect(row, col, size)`；数值运行时从 `getComputedStyle(document.documentElement).getPropertyValue('--tile-small')` 与 `--tile-gap` 解析并 memo 一次，6 处改为引用。

**验证**

把 `--tile-small` 改 80、`--tile-gap` 改 8，确认拖动吸附、拖拽预览框、组背景裁剪输出、样式窗预览四处仍对齐；若错位说明还有硬编码漏网。

### 3.6 前端按名称去重

**现象与证据**

`tauri-bridge.ts:54-57`：

```ts
if (!name || seen.has(name.toLowerCase())) continue
seen.add(name.toLowerCase())
```

Rust 侧是按 id 去重（`scanner.rs:188`），id 稳定为 `lnk:<路径>` / `uwp:<AppID>`。

**反例**

两个不同 AppID、显示名相同的入口（系统“设置”类入口、同公司双版本并存都很常见）：前端只保留先到的一个；若磁贴布局引用的是被吞掉的那个 id，点击时会落到 `TileGrid.vue:159` 的模糊匹配上，可能启动成另一个程序。

**方案**

- 前端改为按 `id` 去重；
- 同名时用“名称 + 来源”区分展示：`AppItem` 增加 `source`（`win32` / `packaged` / `shell`），列表标题对重名条目追加来源后缀；
- `TileGrid.handleTileClick` 的模糊匹配只对 `type === 'shell'` 的内置模拟磁贴启用；真实 id 找不到时直接提示“目标应用已不可用”，不静默匹配。

**验证**

在 `parse_shell_output` 的测试里加两条同名不同 AppID，断言桥接层输出两条；再断言删除其中一个后，磁贴点击给出明确错误而不是启动别的应用。

---

## 4. P2：一致性与维护性

### 4.1 用户元数据分三层，且 `pinnedApps` 是死状态

**现象与证据**

- 文件夹写在 `localStorage`（`useApps.ts:23-41`），磁贴布局写 `tile-layout.json`，外观设置写 `settings.json`。
- `pinnedApps`（`useApps.ts:13`）声明后从未被写入；`pinnedAppList`（`180`）依赖它；`AppList.vue:22` 用 `pinnedAppList.length > 0` 控制“已固定到开始菜单”分区 → 该分区永不渲染。README 第 10 行也标注“列表顶部固定待实现”。

**反例**

用户备份 `%APPDATA%\win-start` 还原到新机器：磁贴、外观都在，文件夹结构全丢（在 WebView 的 localStorage 里）。

**方案（需产品决策）**

- 若暂不做固定：删掉 `pinnedApps`、`pinnedAppList` 与对应分区，避免留着永远为空的 ref 误导后续开发。
- 若要做：新增后端 `ui-state.json`（`{ folders, pinned }`，复用 `storage::write_json_atomic`）；`useApps.ts` 首次启动把 localStorage 数据迁入并留只读备份；右键菜单接“固定到开始菜单”；扫描后按 id 恢复。
- 收敛目标：三层变两层（`ui-state.json` + `tile-layout.json`），备份即完整。

**验证**

清除 WebView2 用户数据目录后重启，文件夹与固定仍在；卸载重装同名但 id 变化的程序，固定状态不串 id。

### 4.2 两套 `windows` crate 并存

**现象与证据**

- `Cargo.toml:18` 主依赖 `windows 0.58`（约 20 个 feature）。
- `Cargo.toml:29` 另起 `windows61 = { package = "windows", version = "0.62" }`。
- `main.rs:1489` 注释：“用裸指针重建本 crate 版本的 HWND，避免 windows crate 版本不一致”；`main.rs:1206` 处 `use windows61::core::Interface` 只为 cast `ICoreWebView2Controller2`。

**分析**

这是 `webview2-com` 版本绑定逼出的妥协，不是随手引入。但它把“版本一致性”压在注释和调用方记忆上：未来升 `windows` 或 `webview2-com`，`HWND(hwnd_t.0)` 这种跨版本裸指针重解释可能变成未定义行为而不报错。

**方案**

- 短期：把跨版本操作收口到 `src-tauri/src/webview_compat.rs`，只保留“取 controller 并设透明背景”一个函数，出入口用 `isize`；其余源码不再出现 `windows61`。`Cargo.toml` 加注释：“这两个版本由 `webview2-com` 决定，升其一必须同步另一个”。
- 中期：用 `cargo tree -d` 判断能否收敛到单一 `windows` 版本，能收敛再动（`windows` 0.58→0.62 签名变化大，属独立任务）。

**验证**

`cargo tree -d` 只剩一处 `windows` 时可删除适配模块；收敛前，任何升级 PR 必须同时改 `webview_compat.rs`。

---

## 5. P3：低成本清理

| 项 | 证据 | 处理 |
| --- | --- | --- |
| `pinyin` 依赖是 alpha 且带 caret | `package.json:22` `^4.0.0-alpha.1` | 锁成精确 `4.0.0-alpha.1`；迁 `pinyin-pro` 另开任务 |
| `$schema` 指向第三方 fork | `tauri.conf.json:2`（`nicehash/tauri`） | 换官方 schema 或删除 |
| 主窗口尺寸自相矛盾 | `tauri.conf.json:21-22`：`width: 740` < `minWidth: 800` | 改 `width: 800` 或降 `minWidth` |
| 调试残留 | `useTiles.ts:424/428/485/492`、`TileGrid.vue:99/127/156` | 删除或 `if (import.meta.env.DEV)`；`dragover` 那条每帧打 `getBoundingClientRect`，开 DevTools 时拖拽明显掉帧 |
| 空白臃肿的 CSS 死变量 | `variables.css:28-30` `--tile-medium/wide/large` 未被使用（网格按 span 计算） | 确认后删除，避免与 span 逻辑混淆 |

---

## 6. 实施顺序

1. **批次 A（纯后端，可单测）**：2.1 提交顺序 + 2.2 损坏备份 + 2.4 锁毒化。
2. **批次 B（进程模型）**：2.3 单实例。
3. **批次 C（安全快速项）**：3.2 默认关闭 + 3.5 几何常量化。
4. **批次 D（性能，需实测对照）**：3.3 热区 tick + 3.4 图标缓存。
5. **批次 E（回归面最大）**：3.1 CSP / devtools / 命令面收敛。
6. **批次 F（产品决策后）**：4.1 固定与元数据收敛。

批次 A 与 B 完成后，`cargo test --offline` 与三条 `scripts/*.test.cjs` 应保持全绿，并新增用例。

## 7. 验收清单

- [ ] 模拟磁盘写失败：设置值不变、旧壁纸仍在、重试可成功
- [ ] 损坏 `settings.json`：生成 `.corrupt-*`、前端告警、原文件不被静默覆盖
- [ ] 连续启动两次：单进程、单端口、不出现双层热区
- [ ] 制造锁毒化：设置读取仍可用，写入返回中文错误而非崩溃
- [ ] release 构建：DevTools 不可打开；渲染层无法访问任意外部域
- [ ] 默认安装：Tile Bridge 未启动；开启后脚本可推送
- [ ] 60 秒内 `EnumWindows` / `SetWindowPos` 调用次数显著下降；置顶窗口不被打断
- [ ] 150 个快捷方式二次扫描耗时下降；改 mtime 只重提单个
- [ ] `--tile-small` 改 80 后拖动、预览、裁剪、样式窗仍对齐
- [ ] 同名不同 AppID 两个入口都出现在列表且可分别启动
- [ ] 备份 `%APPDATA%\win-start` 还原后文件夹与固定完整（4.1 落地后）

## 8. 未实测与待确认

以下为 `inferred`，实施对应批次时用最小动作确认：

- release 构建下 `devtools: true` 的真实可唤起性（`tauri build` 后右键试一次）。
- 热区每秒 tick 的实际 CPU 占比（需 `QueryPerformanceCounter` 统计，当前无 profile 数据）。
- `tauri-plugin-single-instance` 与现有热区线程、`RunEvent::Exit` 清理的交互（插件注册顺序在 builder 最前，需验证退出路径仍会 `service.shutdown()`）。
- 4.1 的产品口径：固定到开始菜单是补齐还是砍掉，需产品决定后再动代码。

## 9. 实施进展

### 批次 A（已落地，待编译验证）

覆盖 2.1 设置提交顺序、2.2 损坏备份、2.4 锁毒化，另附带热区配置的原子写入。

| 文件 | 改动 |
| --- | --- |
| `src-tauri/src/main.rs` | 新增 `guard_or_error` / `guard_or_poisoned` / `persist_then_commit` / `persist_settings`；7 个设置 setter 改为“先落盘后提交”；`get_settings`、`get_tile_opacity` 等读路径改为毒化可恢复；`load_settings` 改为返回 `(AppSettings, Option<String>)`，损坏时先备份 `.corrupt-<毫秒>`；壁纸改为唯一文件名 + 先落盘后清理，`clear_wallpaper` 改为先保存后删文件；`StartupWarning` 状态与 `get_startup_warning` 命令；`CropImagePath` / `StyleTargets` 的锁改用统一辅助函数 |
| `src-tauri/src/launch_button.rs` | `load_all_configs` 区分“不存在”与“损坏”，损坏时备份并回空配置；`save_config` 改用 `storage::write_json_atomic` |
| `src/renderer/src/tauri-bridge.ts` | 新增 `getStartupWarning()` |
| `src/renderer/src/components/BridgeErrorBanner.vue` | 启动时取一次告警并展示 |
| `docs/hardening-plan.md` | 本文件，方案与进展同步 |

新增 Rust 单测（`settings_safety_tests`，10 个用例）：落盘失败不动内存、成功时先写后提交、毒化后读仍可用、毒化写返回错误、损坏配置生成备份且原文件不变、缺失文件不告警不备份、正常配置不误报、壁纸落盘失败保住旧文件且不留暂存、安装成功后清理旧壁纸、清理不误删非壁纸文件。

**已做（可执行部分）**：用 Node 做静态一致性校验——前端 57 个 `command('...')` 调用全部命中 `generate_handler` 注册；两个改动的 `.rs` 文件做字符串/注释感知的括号配平检查，均平衡。

**尚未验证**：本机没有 `cargo` / `rustc`（`where.exe cargo`、`%USERPROFILE%\.cargo` 均为空），仓库也未安装 `node_modules`，因此 `cargo test`、`node --test scripts/*.test.cjs`、`npm run build` 均未执行。编译与测试结论待补，命令：

```powershell
cd C:\Users\bw\my_code\win-start\src-tauri; cargo test --lib
cd C:\Users\bw\my_code\win-start; npm install; node --test scripts/*.test.cjs
```

### 批次 B 起（未开始）

2.3 单实例、3.x 安全与性能项、4.x 一致性与维护性项，按第 6 节顺序推进。

</content>
