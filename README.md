# Win10 开始菜单增强版

> 左侧 Win7 风格程序列表 + 右侧 Win10 磁贴区，融合两代 Windows 开始菜单的最佳体验。

## 功能特性

### 左侧 · Win7 程序列表
- 🔍 **实时搜索**：输入即过滤，支持拼音/模糊匹配
- 📑 **拼音分组**：按 A-Z 字母分组显示所有程序
- 📌 **固定程序**：常用程序一键固定到列表顶部
- 🕐 **最近添加**：最近安装的程序自动置顶
- 👤 **用户栏**：底部头像 + 电源菜单（睡眠/关机/重启）

### 右侧 · Win10 磁贴区
- 🧩 **三种磁贴尺寸**：小（70×70）、中（150×150）、宽（310×150）
- 🔄 **Live Tile 动态磁贴**：3D 翻转动画，支持 Tile Bridge 第三方接入
- 📂 **磁贴分组**：自定义分组名称、新建/重命名/删除分组
- 🖱️ **右键菜单**：调整大小、开关动态磁贴、取消固定、固定到任务栏
- 🎨 **亚克力材质**：半透明磨砂背景，贴近系统原生效果
- 🎯 **系统主题色**：磁贴默认颜色和高亮色自动跟随 Windows 主题色
- 🌓 **磁贴透明度**：未设置壁纸的磁贴支持半透明，可在壁纸设置中调节

### 系统集成
- 📌 **系统托盘**：左键切换菜单，右键菜单（打开/编辑按钮/快捷键/壁纸/退出）
- 🖱️ **悬浮启动按钮**：每个屏幕左下角透明按钮，点击打开开始菜单，可拖拽调整位置
- 🔧 **开机自启**：随系统自动启动
- ⌨️ **全局快捷键**：默认 Alt+W，可自定义
- 💾 **布局持久化**：磁贴位置、分组、固定项自动保存
- 🖥️ **多屏幕支持**：每个屏幕独立显示悬浮按钮和开始菜单

## 技术栈

| 层级 | 技术 |
|------|------|
| 应用框架 | Tauri 2（Rust 后端 + WebView2） |
| 前端框架 | Vue 3 + Vite |
| 状态管理 | Pinia |
| 持久化 | 本地 JSON（`%APPDATA%\win-start\`） |
| 打包 | tauri build（NSIS 安装包） |
| 语言 | Rust + TypeScript |

## 项目结构

```
win-start/
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   ├── main.rs            # 入口：托盘、窗口、设置、热键、自启
│   │   ├── scanner.rs         # 扫描开始菜单快捷方式/UWP
│   │   ├── icon_extract.rs    # 图标提取
│   │   └── launch_button.rs   # 悬浮启动按钮（原生透明窗口）
│   ├── capabilities/          # Tauri 权限配置
│   └── tauri.conf.json        # 窗口与打包配置
└── src/renderer/src/     # Vue 前端
    ├── App.vue           # 根组件
    ├── tauri-bridge.ts   # 前端调用 Rust 命令的桥接层（window.api）
    ├── components/
    │   ├── AppList/      # 左侧程序列表
    │   ├── TileGrid/     # 右侧磁贴区
    │   └── SideToolbar/  # 左侧工具栏
    ├── stores/           # Pinia 状态
    └── styles/           # 样式
```

## 快速开始

### 环境要求
- Node.js 18+
- Rust stable（首次构建 Tauri 会自动安装所需工具链，另需 Microsoft C++ Build Tools 与 WebView2，Windows 10/11 通常已自带 WebView2）
- Windows 10/11（系统功能依赖 Windows API）

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run tauri:dev
```

### 打包构建
```bash
# 生成 NSIS 安装包
npm run tauri:build
```

### 产物位置
```
src-tauri/target/release/bundle/nsis/
└── win-start_0.1.0_x64-setup.exe    # 安装包
```

### 残留进程清理
```bash
# 开发时若 exe 被占用导致重新编译失败
npm run tauri:kill
```

## 开发计划

- [x] 项目骨架 + 基本布局
- [x] 程序列表扫描 + 搜索 + 分组
- [x] 磁贴三种尺寸 + 静态展示
- [x] Live Tile 3D 翻转动画
- [x] 磁贴右键菜单 + 大小调整
- [x] 分组管理 + 布局持久化
- [x] 系统托盘 + 开机自启
- [x] 真实 .lnk 图标提取
- [x] 拖拽排序磁贴
- [x] 主题色跟随系统
- [x] 多显示器支持
- [x] 悬浮启动按钮
- [x] 全局快捷键
- [x] Acrylic 毛玻璃背景
- [x] Tile Bridge 第三方磁贴接入接口
- [ ] Tile Bridge 服务默认启用开关（设置界面）
- [ ] 天气/日历/邮件等扩展磁贴示例

## Tile Bridge · 磁贴桥接服务（第三方接入）

Tile Bridge 是一个本地 HTTP 服务，允许第三方软件或脚本向磁贴推送实时内容，实现类似 Windows 原生 Live Tile 的动态磁贴效果。

> **当前状态**：框架已完成，默认不启动。未来可在设置中添加开关启用。

### 工作原理

```
第三方软件/脚本  ──HTTP POST──>  本地服务(127.0.0.1:18923)  ──>  磁贴翻转显示内容
```

- 我们的软件**被动接收**，不会主动读取或监控任何第三方软件
- 任何语言（Python/C#/Node/Go/AutoHotkey 等）都能接入，只要能发 HTTP 请求
- 服务仅监听 `127.0.0.1`，外部网络无法访问

### API 接口

#### 推送磁贴内容

```
POST http://127.0.0.1:18923/api/tile/update
Content-Type: application/json

{
  "appId": "qq",
  "title": "张三",
  "body": "在吗？看到消息回我一下",
  "icon": "data:image/png;base64,...",
  "count": 3
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appId` | string | 是 | 对应磁贴的 appId，需与磁贴的 appId 一致 |
| `title` | string | 否 | 标题（如发送者、通知标题） |
| `body` | string | 否 | 内容（如消息文本） |
| `icon` | string | 否 | 图标（base64 或 URL） |
| `count` | number | 否 | 未读数 |

**响应**：`{"success": true}`

#### 清除磁贴内容

```
POST http://127.0.0.1:18923/api/tile/clear
Content-Type: application/json

{
  "appId": "qq"
}
```

**响应**：`{"success": true}`

### 调用示例

**curl**：
```bash
curl -X POST http://127.0.0.1:18923/api/tile/update \
  -H "Content-Type: application/json" \
  -d '{"appId":"qq","title":"张三","body":"在吗？","count":3}'
```

**Python**：
```python
import requests
requests.post("http://127.0.0.1:18923/api/tile/update", json={
    "appId": "qq",
    "title": "张三",
    "body": "在吗？",
    "count": 3
})
```

**PowerShell**：
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:18923/api/tile/update" -Method Post -ContentType "application/json" -Body '{"appId":"qq","title":"张三","body":"在吗？"}'
```

### 显示效果

- 收到推送后，对应 `appId` 的磁贴自动 3D 翻转
- 背面显示推送的标题和内容
- 调用 `clear` 接口后，磁贴恢复正常显示
- 磁贴需开启"实时动态磁贴"（右键菜单中开启）

### 应用场景

- IM 软件消息通知（需配合插件或脚本）
- 邮件未读提醒
- 系统监控（CPU/内存/网络）
- 待办事项提醒
- 自定义脚本推送任何信息

## License

MIT
