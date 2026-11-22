# 开始菜单替换方案（Win 键 · 任务栏按钮 · 原生菜单兜底）

> 状态：设计稿（未实施）
> 目标读者：本项目维护者
> 关联文档：[hardening-plan.md](./hardening-plan.md)、[hotzone-architecture.md](./hotzone-architecture.md)、[hotkey-transaction.md](./hotkey-transaction.md)
> 适用系统：本机 Windows build 26300（任务栏为 Win11 系 XAML 实现）；Win10 差异见第 6 节

## 1. 目标与验收口径

产品目标：让本程序成为"系统开始菜单的实际入口"，而不是靠屏幕边缘热区遮挡。

验收口径（四条同时满足才算达成）：

1. 按下并松开 Win 键（不按其他键）→ 本程序菜单出现，系统开始菜单**不出现**。
2. 点击任务栏的开始按钮 → 本程序菜单出现，系统开始菜单**不出现**。
3. Win+E / Win+R / Win+D / Win+X 等组合键仍按系统行为工作。
4. 上述两条入口在**不依赖整屏热区**的情况下成立；热区降级为"任务栏自动隐藏时的兜底"。

## 2. 现状与证据

| 事实 | 证据位置 |
| --- | --- |
| 热区不会对齐真实的开始按钮，Win11 居中按钮直接不识别 | `docs/hotzone-architecture.md:23-24` |
| 现有设计明确声明"没有使用 Explorer 注入或全局鼠标拦截" | `docs/hotzone-architecture.md:36` |
| 全局快捷键走 `tauri-plugin-global-shortcut`（即 `RegisterHotKey`），**无法注册裸 Win 键** | `src-tauri/src/hotkey.rs:3`、`:15-20` |
| 所有菜单开关（热区、托盘、快捷键）已串行化到一个入口 | `src-tauri/src/main.rs:135` `request_menu_toggle` |
| 已掌握任务栏窗口类名（用于全屏判定时排除任务栏） | `src-tauri/src/fullscreen.rs:44` `"Shell_TrayWnd" \| "Shell_SecondaryTrayWnd"` |
| 菜单显示有"就绪等待/序号取消"机制，重复点击不会残留延迟弹出的窗口 | `src-tauri/src/main.rs:25-87` |

结论：**技术底座已经够用**，缺的是"系统级输入入口"这一层。这一层只能是 Win32 钩子或 Explorer 注入，与前端框架无关——上一轮"改回 Electron 不会更合适"的判断在这件事上依然成立。

## 3. 三个子能力拆解

### 3.1 能力 A：Win 键打开本程序菜单

Win 组合键是 shell 用 `RegisterHotKey` 注册的**系统热键**，依赖输入流中的 Win 按下状态。低级键盘钩子（`WH_KEYBOARD_LL`）一旦吞掉 `VK_LWIN` 的 down，输入流里就没有 Win 状态，所有 Win+组合键一起失效。这是必须正视的取舍，而不是实现细节。

| 方案 | 做法 | Win+组合键 | 系统侵入 | 维护成本 | 建议 |
| --- | --- | --- | --- | --- | --- |
| A1 只吞单键 | 吞 LWIN down/up，直接弹菜单 | **失效** | 无 | 低 | 不单独采用 |
| A2 吞单键 + 组合补发 | 先吞；按住期间出现其他键则用 `SendInput` 补发"Win down + 该键"，进入透传直到 Win 松开 | 基本等价 | 无 | 中 | **推荐先做** |
| A3 注入/补丁 Explorer | DLL 注入 Explorer，改 Start 处理函数（StartAllBack / ExplorerPatcher 路线） | 完全等价 | **高** | 高 | 仅 A2 达不到要求时再评估 |

A2 的可行性有先例：AutoHotkey 的 `LWin::` 就是同一机制。风险在时序：补发必须在原按键被吞掉后立即完成，且要避免自己的钩子再次收到注入事件（用 `dwExtraInfo` 标记 + `LLKHF_INJECTED` 过滤）。

### 3.2 能力 B：点任务栏开始按钮打开本程序菜单

| 方案 | 做法 | 侵入 | 版本适配 | 建议 |
| --- | --- | --- | --- | --- |
| B1 全局鼠标钩子 + 矩形命中 | `WH_MOUSE_LL` 里判断点击点是否落在开始按钮矩形内，命中吞掉并开菜单 | 无 | 只需矩形定位正确 | **推荐** |
| B2 透明置顶窗口覆盖按钮 | 把窗口贴到按钮位置接收点击 | 无 | 需逐版本对齐、多屏/DPI/自动隐藏复杂 | 备选/兜底 |
| B3 子类化 Explorer 的 Start 子窗口 | 注入进程吞 `WM_LBUTTONDOWN` | **高**（跨进程注入，需同位数 DLL） | 类名/结构随更新变化 | 不采用（除非走 A3） |

**矩形定位（两条互补，先 UIA 后几何）**

- 首选 UI Automation：从 `Shell_TrayWnd` 的窗口句柄建 `AutomationElement`，按名称（"开始"/"Start"，随语言变化）找到按钮，取 `BoundingRectangle`。任务栏是 XAML 实现，UIA 比硬编码窗口类名抗版本变化——**待实测确认本机 build 26300 能否取到**。
- 几何兜底：任务栏高度 + 开始按钮居中算法（Win11 居中、Win10 靠左），按任务栏所在边与对齐方式算矩形。
- 缓存与失效：UIA 调用耗时在毫秒级，不能每次点击都查。矩形缓存在以下时机刷新：`TaskbarCreated` 广播、`EVENT_OBJECT_LOCATIONCHANGE`（任务栏）、显示器增删/分辨率/DPI 变化、任务栏自动隐藏状态变化。缓存未命中时用几何兜底，宁可多刷新一次也不要在钩子里阻塞。
- 副屏任务栏是 `Shell_SecondaryTrayWnd`，需为每个显示器各算一份。

### 3.3 能力 C：原生开始菜单兜底

即使 A2 出错，也不能让用户看到系统菜单盖住我们的。用 `SetWinEventHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW, ...)` 进程外监听 `StartMenuExperienceHost` 窗口出现；若本程序菜单在 200ms 内未被打开（说明拦截失败），立刻关闭它。

限制：关闭动作有可见的首帧闪现，属于兜底而非主路径；只在探测到"非本程序触发"时执行，避免自己误关。

## 4. 推荐实现路径（分阶段）

### 阶段 0：活体探针（先证明，再动主线）

新增独立 bin `src-tauri/src/bin/hook_probe.rs`（`cargo run --bin hook_probe`），只做四件事并输出结论：

1. 装 `WH_KEYBOARD_LL`，吞 `VK_LWIN`，打印原生开始菜单是否仍然出现。
2. 吞单键成功后再试"补发组合"：`Win+E` 是否打开资源管理器、`Win+R` 是否打开运行框、`Win+L` 是否锁屏。
3. 用 UIA 打印开始按钮矩形，与 `GetWindowRect(Shell_TrayWnd)` 对比，验证居中算法是否一致。
4. 装 `WH_MOUSE_LL`，打印命中/未命中日志，确认点击开始按钮时命中、点击任务栏其他区域不命中。

探针必须先在实机跑通，再进入阶段 1。这是整个方案的成败点，**主流 Windows 版本差异都集中在这里**。

### 阶段 1：钩子模块 `shell_hook.rs`

- 独立线程 + `GetMessage` 消息循环（`SetWindowsHookEx` 要求安装线程有消息泵，回调也在该线程执行）。
- 回调只做三件事：判定、投递消息到 channel、返回。任何 UIA、文件、Tauri 调用都不允许出现在回调里。
- 主线程收到 channel 后调用现有的 `request_menu_toggle(app, Some((x, y, monitor)))`（`src-tauri/src/main.rs:135`），复用既有的串行化与"菜单遮挡时不切换"逻辑。
- 安装失败（被安全软件阻止、钩子返回 NULL）必须向上报告，不能静默降级。

### 阶段 2：接入与开关

- 新增设置项 `shell_hook_enabled`（默认 **false**，用户在设置页显式开启，附风险说明）。
- 新增命令 `get_shell_hook_state` / `set_shell_hook_enabled`，返回"已启用/安装失败原因/安全软件拦截"三态。
- 启动时按设置决定是否安装；关闭时先卸载钩子再退出。
- 前端设置页加开关 + 一行状态提示；失败时明确告诉用户"开启失败，仍可用热区/Alt+W"。

### 阶段 3：热区降级为兜底

- `launch_button.rs` 保留：任务栏自动隐藏时，开始按钮不在可点位置，热区负责"从屏幕边缘唤出"。
- `hotzone-architecture.md` 补一节"入口职责变更"，说明热区不再是主入口。
- 不删除热区代码，避免回退成本。

## 5. 关键技术设计（Win 键状态机）

事件序列与行为（`LWIN` 指 `VK_LWIN`/`VK_RWIN`）：

| 事件 | 当前状态 | 行为 |
| --- | --- | --- |
| LWIN down | idle | 吞掉，置 `pending`，**不弹菜单** |
| 其他键 down | pending | 补发"Win down + 该键"（标记 `dwExtraInfo`），转 `passthrough`，此后不再吞 |
| LWIN up | pending | 吞掉 up，弹/收菜单（调用 `request_menu_toggle`），回 `idle` |
| LWIN up | passthrough | 不吞，回 `idle` |
| LWIN down | passthrough 之外的重复 down（长按自动重复） | 吞掉，保持 `pending` |
| 任何事件 | 本程序自身注入（`LLKHF_INJECTED` + 我们的标记） | 直接放行，防递归 |

注意点：

- **必须同时吞 down 和 up**。只吞 down、放行 up，Explorer 仍会收到 up 从而弹出开始菜单。
- 长按 Win 键的自动重复必须吞掉，否则重复触发。
- 补发组合时若用户按的是 `L`，会真的锁屏——这是预期行为，不是 bug。
- Win+Tab / Win+X 这类 shell 自绘界面由 Explorer 处理，补发后应正常；仍需实机确认。

鼠标侧命中判定（全部满足才吞）：

1. 点击点落在当前显示器开始按钮矩形内（含 4px 容差）。
2. 该点所在窗口属于任务栏（`WindowFromPoint` → 祖先链含 `Shell_TrayWnd` / `Shell_SecondaryTrayWnd`），排除"菜单刚好压在按钮上"的误判。
3. 编辑模式 / 设置窗口打开时不吞（沿用 `MENU_BLOCKED` 语义）。
4. 非注入事件（`LLMHF_INJECTED` 直接放行）。

## 6. 风险与限制

| 风险 | 现象 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 安全软件误报 | 全局键鼠钩子被拦或报毒 | 功能失效/安装失败 | 默认关闭、不注入内存、行为可解释、发布前做杀软实测；必要时代码签名 |
| 组合键补发时序 | Win+E 偶尔无响应或触发两次 | 体验割裂 | 探针先测；补发时加 30–50ms 去抖窗口；失败降级为"只吞单键"并提示 |
| 任务栏结构变化 | 更新后 UIA 取不到按钮 | 点击入口失效 | 几何兜底 + 刷新失败时回退到热区 |
| UIA 调用阻塞 | 钩子回调卡住导致全桌面输入变慢 | 严重 | 回调内禁止 UIA；矩形全部走缓存 |
| 多屏/自动隐藏/任务栏在左|上 | 命中区错位 | 按 `Shell_SecondaryTrayWnd` 逐屏算；自动隐藏时交给热区 |
| 系统保留路径 | Win+L、Ctrl+Alt+Del、UAC 安全桌面、锁屏、远程桌面、独占全屏游戏 | 拦截无效 | 文档明示；不做绕过 |
| 权限完整性级别 | 前台是提权程序时钩子收不到事件 | Win 键偶发不生效 | 文档说明；不做提权绕过 |
| Win10 差异 | 任务栏非 XAML，按钮位置靠左、存在搜索框占位 | 定位算法不同 | 几何算法按版本分支；Win10 优先用 `Start` 子窗口矩形 |

标记为 `inferred` 的项（需实机确认，不能当已知）：UIA 能否在 build 26300 取到开始按钮；补发组合的成功率；鼠标钩子对任务栏点击的吞没是否影响任务栏悬停动画。

## 7. 改动清单（文件级）

| 文件 | 改动 |
| --- | --- |
| `src-tauri/src/shell_hook.rs` | 新增：键盘/鼠标钩子、状态机、矩形缓存与刷新 |
| `src-tauri/src/bin/hook_probe.rs` | 新增：阶段 0 探针（不进发布包） |
| `src-tauri/src/main.rs` | `mod shell_hook`；启动安装/卸载；接 `request_menu_toggle`；新增两个命令 |
| `src-tauri/Cargo.toml` | 如需 UIA，加 `windows` 的 `UI_Automation` feature（当前已依赖 `windows` 0.62 别名包） |
| `src/renderer/src/components/Settings*.vue` | 开关 + 状态提示 + 风险说明 |
| `src/renderer/src/tauri-bridge.ts` | 两个命令的类型与封装 |
| `docs/hotzone-architecture.md` | 补"入口职责变更"一节 |
| `docs/start-menu-replacement-plan.md` | 本文件，实施后追加"进展"章节 |

## 8. 验证与验收

探针（阶段 0，必须全部通过）：原生菜单不再出现；Win+E/R/D 正常；Win+L 正常锁屏；开始按钮矩形与 UIA 一致；点击开始按钮命中、点击任务栏其他位置不命中。

桌面手测（阶段 2 后）：

1. 冷启动后第一次按 Win 键 → 菜单出现且焦点在搜索框。
2. 菜单已打开时再按 Win 键 → 关闭（toggle 语义）。
3. 点击开始按钮 → 同上两条行为一致。
4. Win+E / Win+R / Win+D / Win+X / Win+Tab / Win+L 逐个验证。
5. 长按 Win 键 3 秒不重复触发。
6. 副屏任务栏点击同样生效；任务栏自动隐藏时用热区唤出。
7. 任务栏换到顶部/左侧后重新验证命中区。
8. 显示器插拔、DPI 改变后命中区仍正确（缓存刷新生效）。
9. 前台是管理员程序时按 Win 键，记录实际表现（预期可能失效）。
10. 关闭设置开关后，Win 键恢复系统行为、钩子完全卸载（任务管理器无残留线程）。

## 9. 待确认决策

1. **是否接受 A2 的取舍**：Win+组合键靠补发实现，个别组合（尤其 Win+Tab）可能需要二次修正。若不接受，只能走向 A3 注入，风险和维护成本陡增。
2. **钩子默认开还是关**：建议默认关（安全软件与误触风险），首次启动引导用户开启。
3. **热区是否保留**：建议保留作自动隐藏兜底，不删除代码。
4. 阶段 0 探针是否现在就写：它不改主线，只在 `src-tauri/src/bin/` 下新增一个文件，风险最低。
