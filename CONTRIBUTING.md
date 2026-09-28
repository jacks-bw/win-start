# 贡献指南

感谢你对 Win10 开始菜单增强版的关注！欢迎提交 Issue 和 Pull Request 来帮助改进这个项目。

## 开始之前

- 请先搜索已有的 [Issue](https://github.com/jacks-bw/win-start/issues)，避免重复提交
- 重大功能建议请先开 Issue 讨论，确认方向后再动手开发
- 提交代码前请确保 `npm run build` 能通过

## 开发环境

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

### 构建验证
```bash
npm run build
```

## 提交代码流程

### 1. Fork 并克隆
```bash
# Fork 本仓库到你的账号后，克隆你的 Fork
git clone https://github.com/你的用户名/win-start.git
cd win-start

# 添加原仓库为 upstream，方便同步更新
git remote add upstream https://github.com/jacks-bw/win-start.git
```

### 2. 创建功能分支
```bash
git checkout -b feature/你的功能名
# 或修复 bug
git checkout -b fix/问题描述
```

### 3. 修改代码并提交
```bash
git add .
git commit -m "简要说明做了什么"
```

**提交信息规范**：
- 用中文说明，简洁明了
- 格式：`类型: 描述`
- 类型可选：`feat`（新功能）、`fix`（修复）、`docs`（文档）、`refactor`（重构）、`style`（样式）、`chore`（构建/工具）

示例：
```
feat: 磁贴增加3D倾斜效果
fix: 修复多屏幕托盘菜单位置错误
docs: 更新README安装说明
```

### 4. 推送到你的 Fork
```bash
git push origin feature/你的功能名
```

### 5. 提交 Pull Request
- 在 GitHub 上打开你的 Fork 仓库
- 点击「Compare & pull request」
- 目标分支选 `master`
- 填写 PR 标题和描述，说明做了什么、为什么这么做
- 提交后等待审核

## 代码审核

- 维护者会在 PR 下评论，可能需要你修改
- 审核通过后会合并到 master
- 如果 PR 不被采纳，会说明原因并关闭

## 本地测试 PR（维护者用）

审核别人的 PR 时，可以拉到本地测试：
```bash
git fetch upstream pull/PR编号/head:pr-test
git checkout pr-test
npm run build
npm run dev
# 测试完切回 master
git checkout master
git branch -D pr-test
```

## 项目结构

```
src/main/              # Electron 主进程
  ├── index.ts         # 入口
  ├── window-manager.ts # 窗口管理
  ├── tray.ts          # 系统托盘
  ├── ipc.ts           # IPC 通信
  ├── tile-bridge.ts   # 磁贴桥接服务（第三方接入）
  └── ...
src/preload/           # 预加载脚本
src/renderer/src/      # Vue 渲染进程
  ├── components/
  │   ├── AppList/     # 左侧程序列表
  │   └── TileGrid/    # 右侧磁贴区
  └── stores/          # Pinia 状态
```

## 有问题？

- 提交 [Issue](https://github.com/jacks-bw/win-start/issues) 描述问题
- 附上复现步骤、截图、错误日志

再次感谢你的贡献！
