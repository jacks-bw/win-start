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
- 🧩 **四种磁贴尺寸**：小（70×70）、中（150×150）、宽（310×150）、大（310×310）
- 🔄 **Live Tile 动态磁贴**：3D 翻转动画，模拟通知轮换
- 📂 **磁贴分组**：自定义分组名称、新建/重命名/删除分组
- 🖱️ **右键菜单**：调整大小、开关动态磁贴、取消固定、固定到任务栏
- 🎨 **亚克力材质**：半透明磨砂背景，贴近系统原生效果

### 系统集成
- 📌 **系统托盘**：左键切换菜单，右键菜单（打开/退出）
- 🔧 **开机自启**：随系统自动启动
- ⌨️ **快捷键**：ESC 键关闭菜单
- 💾 **布局持久化**：磁贴位置、分组、固定项自动保存

## 技术栈

| 层级 | 技术 |
|------|------|
| 应用框架 | Electron 28 |
| 前端框架 | Vue 3 + Vite |
| 状态管理 | Pinia |
| 持久化 | electron-store |
| 打包 | electron-builder |
| 语言 | TypeScript |

## 项目结构

```
win-start/
├── src/main/              # Electron 主进程
│   ├── index.ts          # 入口
│   ├── window-manager.ts  # 窗口管理
│   ├── tray.ts           # 系统托盘
│   ├── scanner.ts        # 扫描开始菜单快捷方式
│   ├── launcher.ts       # 启动程序
│   ├── store.ts         # 数据持久化
│   └── ipc.ts           # IPC 通信
├── src/preload/          # 预加载脚本（安全桥接）
└── src/renderer/src/     # Vue 渲染进程
    ├── App.vue           # 根组件
    ├── components/
    │   ├── AppList/      # 左侧程序列表
    │   └── TileGrid/     # 右侧磁贴区
    ├── stores/           # Pinia 状态
    └── styles/           # 样式
```

## 快速开始

### 环境要求
- Node.js 18+
- Windows 10/11（部分系统功能依赖 Windows API）

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```

### 打包构建
```bash
# 生成 NSIS 安装包 + 便携版 exe
npm run build

# 仅输出免安装目录
npm run build:dir

# 仅生成便携版单文件 exe
npm run build:portable
```

> **国内网络注意**：如果打包时下载 `winCodeSign` 等依赖超时，先设置 electron-builder 二进制镜像再打包：
> ```bash
> # 设置 electron-builder 二进制镜像
> set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
>
> # 重新打包
> npm run build
> ```

### 产物位置
```
dist/
├── Win10StartMenu Setup 1.0.0.exe    # 标准安装包
└── Win10StartMenu-1.0.0-portable.exe # 便携版
```

## 开发计划

- [x] 项目骨架 + 基本布局
- [x] 程序列表扫描 + 搜索 + 分组
- [x] 磁贴四种尺寸 + 静态展示
- [x] Live Tile 3D 翻转动画
- [x] 磁贴右键菜单 + 大小调整
- [x] 分组管理 + 布局持久化
- [x] 系统托盘 + 开机自启
- [ ] 真实 .lnk 图标提取
- [ ] 拖拽排序磁贴
- [ ] 主题色跟随系统
- [ ] 天气/日历/邮件等扩展磁贴
- [ ] 多显示器支持

## License

MIT
