# 桌面桥接契约（A3）

`tauri-bridge.ts` 导出冻结的 `desktopApi`，`env.d.ts` 通过其实际类型声明 `Window.api`。
删除了为未知方法返回 `Promise.resolve(null)` 的 Proxy，不再单独维护会漂移的 Api 接口清单。
未知方法在类型检查和接口审计中报错；运行时为 undefined，误调用会立即失败。

## 已完成

- 原生命令使用明确的参数及返回值类型。启动应用、设置自启等后端返回 `()` 的命令，前端使用 `Promise<void>`，不再声明虚假的成功对象或 boolean。
- 配置、扫描结果、头像与裁剪数据使用具体类型，移除桥接中的 `any` 和类型强转兜底。
- 旧快捷键窗口统一使用 `getSettings().hotkey / setHotkey()`，默认值统一为 Alt+W，并正常显示注册失败。
- 头像读取失败会抛出错误，区别于未设置头像返回 null。头像和裁剪窗口显示失败信息。
- 裁剪保存的 Promise 包含窗口关闭，保存失败不会关闭裁剪窗口。
- `setMenuBusy` 接入真实 Rust 命令，忙碌状态与编辑窗口/缩放锁组合，忙碌锁不启用遮挡裁剪控件的交互罩。
- 所有事件订阅返回取消函数，允许在异步注册完成前取消。注册失败会通过 `onBridgeError` 通知当前窗口错误提示。
- 移除未调用的旧主题接口、头像裁剪空入口和列表 togglePin 空链路。

## 仍未实现的功能

`capabilities` 中 `toolbarCustomization / powerActions / taskbarPinningGuide / tileBridge` 已为 true。
工具栏保存、电源操作和系统手动固定引导均转发到真实 Rust 命令。
`taskbarPinning` 仍为 false；直接自动固定调用拒绝，不返回假成功。
后续 A2/A6 实现及验收边界见 [daily-actions.md](daily-actions.md)。
Tile Bridge 已接通原生 HTTP 服务、启停状态及带修订号的快照订阅；订阅完成后获取初始快照，取消订阅后抑制晚到结果。见 [tile-bridge.md](tile-bridge.md)。

后续 A11 已补齐组件事件订阅和异步 watcher 的回收，主题事件也统一经桥接订阅；见 [lifecycle.md](lifecycle.md)。
快捷键注册失败后的原快捷键恢复已在后续 A9 中完成，见 [hotkey-transaction.md](hotkey-transaction.md)。

## 验证

- `npm run test:bridge`：10 项测试，检查全项目 TypeScript/Vue 的 API 引用均存在，桥接命令名均被 Rust 注册，未知调用失败、未支持操作拒绝、参数传递、头像读取错误、扫描字段映射、裁剪关闭时序和订阅取消/失败。
- 14 项数据保护测试、37 项 Rust 测试、TypeScript 检查及前后端构建。
- 测试使用注入的桌面传输模拟，没有执行电源操作或修改真实用户头像。

真实 WebView 中的错误提示、头像裁剪及菜单忙碌交互仍需桌面验收。
