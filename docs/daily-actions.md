# 日常操作与应用分类（A2 / A6）

## 实现范围

工具栏支持保存顺序、添加、删除及空列表。Rust 校验入口白名单和重复项，原子保存成功后才更新内存并发送通知；前端保存失败保留原列表，加载失败时禁止覆盖配置。旧配置缺少 toolbarItems 时使用原四个入口，显式空数组仍保持为空。系统入口通过 Shell、已知目录及运行对话框接口打开，不拼接 cmd 命令。

电源菜单支持锁定、睡眠、关机和重启。后端使用类型化动作白名单及互斥锁，调用 LockWorkStation、SetSuspendState 和 ExitWindowsEx；临时启用关机权限后恢复原权限并关闭句柄。关机和重启没有设置强制结束应用的标志。API 接受请求不等于系统已完成操作，应用或系统策略仍可能阻止关机；调用错误返回界面，菜单恢复可见。

任务栏菜单明确显示“在系统中固定到任务栏…”。有快捷方式时定位文件，否则打开 shell:AppsFolder，由用户在系统中完成固定。当前不支持自动固定任意第三方应用，taskbarPinning 仍为 false，直接调用会报错。微软公开 TaskbarManager 面向请求固定当前应用，不能据此实现任意应用的静默固定。

“管理已安装的应用…”打开系统应用管理页，由用户选择卸载，不声称已经卸载所选应用。

## 分类与兼容性

开始菜单快捷方式为 win32；Get-StartApps 结果按标识格式区分 packaged 和 shell。packaged 仅表示标识符合包族名加应用 ID 的格式，不证明是 UWP。启动目标独立保存为 path 或 shell，不依赖分类标签。文件位置入口依据是否存在快捷方式路径显示。

历史 Get-StartApps 入口的 ID 继续使用 uwp: 前缀，避免现有磁贴引用失效；此前缀不再作为应用类型判断依据。启动失败显示错误并保留菜单，成功后再隐藏。

## 验证与桌面验收

首轮自动验证：37 项 Rust 测试、14 项数据保护测试、10 项桥接测试、TypeScript 检查及前后端构建。

后续桌面反馈：锁定正常，睡眠、关机、重启报 0x800703E6。定位到 AdjustTokenPrivileges 传入 PreviousState 却遗漏 ReturnLength，已补齐返回长度指针，并给权限阶段错误添加操作上下文。新增使用独立复制令牌调用真实权限 API 的回归测试，不替换进程令牌，不执行电源动作；4 项电源测试及 Rust 构建通过。修复后的实际睡眠、关机、重启仍待桌面复测。接口要求见 [AdjustTokenPrivileges](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-adjusttokenprivileges)。

桌面仍需验证：工具栏增删后重启保持、多窗口通知同步、目录和运行对话框打开；快捷方式及不同 Shell 入口启动、失败提示；系统手动固定和应用管理入口。电源实际行为应在用户保存工作后单独验收。热区多屏、任务栏层级和全屏进出仍按 hotzone-architecture.md 验收。

## Windows 接口依据

- [TaskbarManager 固定当前应用](https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/pin-to-taskbar)
- [Get-StartApps 与 AUMID](https://learn.microsoft.com/en-us/windows/configuration/store/find-aumid)
- [SetSuspendState](https://learn.microsoft.com/en-us/windows/win32/api/powrprof/nf-powrprof-setsuspendstate)
- [ExitWindowsEx 的权限、请求返回及强制标志](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-exitwindowsex)
