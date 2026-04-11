# Tapdance Electron 桌面版开发计划

将现有 React + Vite Web 应用打包为 Electron 桌面应用，支持 macOS（DMG）和 Windows（NSIS 安装包）分发。

---

## 1. 当前项目架构分析

| 层 | 技术 | 关键文件 |
|---|---|---|
| 前端 (Renderer) | React 19 + Vite 6 + Tailwind v4 + Motion | `src/` 目录, `index.html` |
| 后端 (Bridge Server) | Express 4 + Node.js | `server/seedanceBridge.mjs` |
| 持久化 | better-sqlite3 (WAL 模式) | `server/appStateStore.mjs` |
| 外部 CLI | `dreamina` CLI (Seedance 视频生成) | 通过 `execFile` 调用 |
| 构建 | Vite | `vite.config.ts` |

### 架构特点与挑战

1. **前后端分离**：前端通过 Vite proxy (`/api/seedance → localhost:3210`) 与 Express bridge 通信
2. **原生模块**：`better-sqlite3` 是 C++ 原生 addon，需要针对 Electron 重新编译
3. **文件系统访问**：Bridge 大量使用 `fs` API 管理本地文件（素材库、任务文件、临时上传等）
4. **外部 CLI 调用**：通过 `child_process.execFile` 调用 `dreamina` CLI
5. **环境变量**：`GEMINI_API_KEY` 在构建时注入，其余由 `.env` / 运行时管理

---

## 2. 技术选型

### 构建工具：`electron-vite`

选用 [electron-vite](https://electron-vite.org/) (by alex8088)：

- 对 Vite 6 支持良好，与现有 Vite 配置兼容
- 内置 main / preload / renderer 三进程构建
- 与 `electron-builder` 无缝集成
- 社区活跃度高，文档完善

### 打包工具：`electron-builder`

选用 [electron-builder](https://www.electron.build/)：

- 成熟稳定，支持 macOS DMG + Windows NSIS
- 自带原生模块重编译
- 支持代码签名、公证、自动更新

### Bridge Server 嵌入策略

**方案 A：主进程内嵌 Express**（推荐）

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A) 主进程内嵌 Express** | 改动最小，复用现有代码 | 占用主进程端口，需处理端口冲突 |
| **B) 完全迁移到 IPC** | 架构更优雅，无端口占用 | 改动量大，需重写所有 API 调用 |

推荐方案 A：在 Electron 主进程中直接启动 Express server，渲染进程仍通过 HTTP 请求通信。改动最小，开发周期短。后续可渐进迁移到 IPC。

---

## 3. 新增依赖

```
devDependencies:
  electron: ^35.x
  electron-vite: ^3.x
  electron-builder: ^26.x
  @electron-toolkit/preload: ^3.x
  @electron-toolkit/utils: ^3.x
```

---

## 4. 目录结构变更

```
Tapdance/
├── electron/                    # [NEW] Electron 专用代码
│   ├── main/
│   │   ├── index.ts            # 主进程入口
│   │   └── bridge.ts           # Bridge server 封装
│   ├── preload/
│   │   └── index.ts            # 预加载脚本
│   └── tsconfig.json           # Electron TS 配置
├── build-resources/             # [NEW] 打包资源
│   ├── icon.icns               # macOS 图标
│   ├── icon.ico                # Windows 图标
│   ├── icon.png                # 512x512 PNG 源图标
│   └── entitlements.mac.plist  # macOS 权限声明
├── out/                         # [NEW] electron-vite 构建输出 (git忽略)
├── release/                     # [NEW] electron-builder 打包输出 (git忽略)
├── server/                      # [保持] 原有 Bridge server（Web 模式仍用）
├── src/                         # [微调] 渲染进程, 少量适配
├── electron.vite.config.ts      # [NEW] electron-vite 配置
├── vite.config.ts               # [保持] 纯 Web 模式配置
├── package.json                 # [修改] 添加 Electron 依赖和 scripts
└── ...
```

---

## 5. 分阶段实施详情

### Phase 1: 项目基础设施改造

#### 新建 `electron.vite.config.ts`

Electron-vite 专用配置文件，定义 main / preload / renderer 三个构建目标：

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    },
    resolve: {
      alias: { '@': resolve(__dirname, '.') }
    }
  }
})
```

#### 修改 `package.json`

- 添加 `main` 入口指向 `out/main/index.js`
- 添加 Electron 相关依赖
- 添加新 scripts

```json
{
  "main": "out/main/index.js",
  "scripts": {
    "dev:electron": "electron-vite dev",
    "build:electron": "electron-vite build",
    "pack:mac": "electron-vite build && electron-builder --mac",
    "pack:win": "electron-vite build && electron-builder --win",
    "pack:all": "electron-vite build && electron-builder --mac --win"
  }
}
```

#### 修改 `.gitignore`

添加 Electron 相关忽略项：

```
out/
release/
```

---

### Phase 2: Electron 主进程

#### 新建 `electron/main/index.ts`

Electron 主进程入口，负责：

```
功能清单：
├── 创建 BrowserWindow（带 preload 脚本）
├── 启动内嵌 Express Bridge Server
├── 注册 IPC 处理器（原生对话框、文件选择等）
├── 窗口管理（大小记忆、最小/最大化）
├── macOS dock 行为处理
├── 开发模式：加载 localhost dev server
└── 生产模式：加载打包后的 HTML
```

关键设计：

- 窗口默认尺寸 `1440x900`，最小 `1024x700`
- `webPreferences.nodeIntegration = false`, `contextIsolation = true`（安全最佳实践）
- 将 Bridge server 作为内部模块启动，不再需要单独进程

#### 新建 `electron/main/bridge.ts`

从现有 `server/seedanceBridge.mjs` 迁移，适配 Electron 环境：

```
改动点：
├── 数据目录迁移到 app.getPath('userData')
├── 端口自动选择（避免冲突）
├── 日志输出到 Electron 日志目录
└── 保持 API 接口完全一致
```

> 注：`server/seedanceBridge.mjs` 和 `server/appStateStore.mjs` 原有代码保持不变，仍支持 Web 模式开发。
> `electron/main/bridge.ts` 是对它们的封装/导入层。

#### 新建 `electron/preload/index.ts`

预加载脚本，通过 `contextBridge` 向渲染进程暴露安全 API：

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,
  isElectron: true,

  // 原生对话框
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:open', options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:save', options),

  // 窗口控制
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Bridge URL（生产模式动态端口）
  getBridgeUrl: () => ipcRenderer.invoke('bridge:getUrl'),

  // 外部链接
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
})
```

#### 新建 `electron/tsconfig.json`

Electron 主进程/预加载脚本专用 TypeScript 配置：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "outDir": "../out",
    "types": ["node"]
  },
  "include": ["main/**/*", "preload/**/*"]
}
```

---

### Phase 3: 渲染进程适配

#### 修改 `src/services/seedanceBridgeUrl.ts`

检测 Electron 环境并动态获取 Bridge URL：

```typescript
// 新增 Electron 环境检测
function isElectronEnv() {
  return typeof window !== 'undefined'
    && (window as any).electronAPI?.isElectron === true;
}

// getSeedanceBridgeBaseUrl 中添加 Electron 分支
// 如果是 Electron 环境，从 preload 获取实际 bridge URL
```

#### 修改 `src/App.tsx`

- API Key 检查逻辑适配（Electron 模式不依赖 `window.aistudio`）
- 外部链接用 `electronAPI.openExternal` 打开

#### 修改 `src/features/app/utils/downloadMedia.ts`

- Electron 模式下使用原生保存对话框替代浏览器下载行为

#### 新建 `src/types/electron.d.ts`

添加 `window.electronAPI` 的 TypeScript 类型声明。

---

### Phase 4: 打包配置与资源

#### electron-builder 配置 (package.json `build` 字段)

```json
{
  "build": {
    "appId": "com.tapdance.ai-director",
    "productName": "Tapdance",
    "directories": {
      "output": "release",
      "buildResources": "build-resources"
    },
    "files": [
      "out/**/*",
      "server/**/*",
      "node_modules/better-sqlite3/**/*",
      "node_modules/bindings/**/*",
      "node_modules/file-uri-to-path/**/*"
    ],
    "asar": true,
    "asarUnpack": [
      "node_modules/better-sqlite3/**/*"
    ],
    "mac": {
      "target": [
        { "target": "dmg", "arch": ["universal"] }
      ],
      "icon": "build-resources/icon.icns",
      "category": "public.app-category.productivity"
    },
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] }
      ],
      "icon": "build-resources/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "deleteAppDataOnUninstall": false
    },
    "npmRebuild": true
  }
}
```

> **重要**：`better-sqlite3` 需要从 ASAR 中解包（`asarUnpack`），因为它包含 `.node` 原生二进制文件。
> 构建时 `electron-builder` 会自动用 `electron-rebuild` 重新编译原生模块。

#### 新建 `build-resources/` 目录

打包资源：

```
build-resources/
├── icon.icns               # macOS 图标
├── icon.ico                # Windows 图标
├── icon.png                # 512x512 PNG 源图标
└── entitlements.mac.plist  # macOS 权限声明
```

macOS entitlements 文件内容（允许 CLI 调用和网络访问）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

---

### Phase 5: 开发体验

原有 Web 开发模式完全保留：

| 命令 | 功能 |
|---|---|
| `npm run dev` | 原有 Web 模式（Vite + Bridge 双进程） |
| `npm run dev:web` | 仅启动 Vite（纯前端） |
| `npm run dev:electron` | Electron 开发模式（主进程 + 内嵌 Bridge + Vite HMR） |
| `npm run build:electron` | 构建 Electron 产物 |
| `npm run pack:mac` | 打包 macOS DMG |
| `npm run pack:win` | 打包 Windows NSIS 安装包 |
| `npm run pack:all` | 同时打包 Mac + Win |

---

### Phase 6: CI/CD 与自动更新 (后续阶段)

第一阶段先实现本地构建。后续可添加：

- GitHub Actions 自动构建 macOS + Windows
- `electron-updater` 自动更新（需要 GitHub Releases 或自建更新服务器）
- macOS 公证（Notarization，需 Apple Developer ID $99/年）
- Windows 代码签名（需 EV 证书 ~$200-400/年）

---

## 6. 代码签名说明

macOS 和 Windows 的代码签名需要开发者证书：

- **macOS**：需要 Apple Developer ID 才能通过 Gatekeeper。未签名的 App 用户安装时需要执行 `右键 → 打开` 或在系统偏好中「允许」。
- **Windows**：需要 EV 代码签名证书才能避免 SmartScreen 警告。未签名的安装包会出现"Windows 已保护你的电脑"提示，用户需点「更多信息 → 仍要运行」。

建议先不做签名，把功能跑通为优先。

---

## 7. 关键注意事项

1. **Node.js 版本**：当前 Node 20.18.1，`@electron/rebuild` 要求 22.12+。建议升级到 Node 22 LTS。
2. **`dreamina` CLI 路径**：打包后用户需自行安装 `dreamina` CLI 到系统 PATH 中。可考虑后续在设置页增加 CLI 路径配置。
3. **数据目录**：Electron 模式下，`local_data/` 和 `local_asset_library/` 将迁移到 `app.getPath('userData')` 下，符合各平台 App 数据管理规范。
4. **跨平台构建**：macOS DMG 只能在 macOS 上构建；Windows NSIS 可以在 macOS 上构建（通过 Wine）。推荐使用 GitHub Actions 进行多平台构建。

---

## 8. 验证计划

```bash
# 1. 现有测试不受影响
npm test
npm run lint

# 2. Web 模式构建验证
npm run build

# 3. Electron 开发模式验证
npm run dev:electron
# 验证：窗口正常打开，Bridge 健康检查通过，HMR 正常

# 4. Electron 生产构建
npm run build:electron

# 5. macOS 打包
npm run pack:mac
# 验证：release/ 下生成 .dmg 文件，安装后 App 可正常运行

# 6. Windows 打包 (需在 Windows 或通过 CI)
npm run pack:win
# 验证：release/ 下生成 .exe 安装包
```

### 手动验证清单

- [ ] macOS DMG 安装后启动正常，Bridge 连接正常
- [ ] Windows NSIS 安装后启动正常，Bridge 连接正常
- [ ] 素材库文件存储路径正确（`userData` 目录）
- [ ] `dreamina` CLI 调用正常工作
- [ ] 应用窗口大小/位置记忆正常
- [ ] 原有 Web 模式开发不受影响（`npm run dev` 正常工作）
