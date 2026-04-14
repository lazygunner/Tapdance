# Tapdance

AI 导演工作台。把一句创意想法逐步整理成 Brief、角色 / 场景资产、分镜、首尾帧提示词、视频提示词和可轮询的视频生成任务。

当前项目以 `Electron + React + Vite + TypeScript` 桌面应用为主，支持 `Google Gemini / Veo`、`火山引擎 Ark`，并提供本地 Seedance / Dreamina bridge 和 Mock 演示流程。

## 功能

- 创意输入后生成结构化 `Brief`
- 生成并维护角色、场景、商品等一致性资产
- 生成分镜列表、首帧 / 尾帧提示词、图像提示词、视频提示词
- 支持单镜头视频、转场视频、极速成片工作流
- 支持 Gemini / Veo、火山引擎 Ark、Seedance bridge
- 支持按流程阶段或单次操作覆盖模型
- 支持 Mock 模式，无密钥时也能演示主流程
- 本地保存项目、API 配置、调用日志、素材库和界面偏好

## 用户使用

推荐直接使用桌面版。桌面版会自动启动内置 bridge，并把项目、配置、调用日志和素材数据持久化到本地应用目录；相比之下，Web 版更适合界面调试。

### 1. 环境准备

- Node.js 22+ 推荐
- npm
- 如需本地 Seedance / Dreamina 流程，确保机器上可直接执行 `dreamina`

### 2. 安装依赖

```bash
npm install
```

### 3. 启动桌面版

```bash
npm run dev:electron
```

启动后会：

- 打开 Electron 桌面应用
- 自动启动内置 Seedance bridge
- 自动接入本地持久化存储

### 4. 首次进入应用建议先做这几件事

1. 进入“API 配置”，按需填写 Gemini、火山引擎 Ark、TOS 等配置
2. 选择默认文本 / 生图 / 视频模型
3. 如果暂时没有模型密钥，先开启 `Mock` 模式跑通主流程
4. 如需本地 Dreamina 执行器，确认配置页里的 Seedance 健康检查通过

### 5. 推荐使用路径

1. 新建项目，输入一句创意想法
2. 生成结构化 `Brief`
3. 补充角色、场景、商品等一致性资产
4. 继续生成分镜、首尾帧提示词、视频提示词
5. 在“视频”或“极速成片”中提交任务并轮询结果

### 6. 基础检查

```bash
npm test
npm run lint
npm run build:electron
```

## 常用命令

```bash
npm run dev:electron # 推荐：启动桌面版开发环境
npm run build:electron
npm run pack:mac
npm run pack:win
npm run dev:web      # 仅用于前端页面调试
npm run dev:bridge   # 仅用于单独调试本地 bridge
npm run dev          # 同时启动 Vite 和独立 bridge（偏 Web 调试场景）
npm test
npm run lint
npm run build
npm run preview
```

## 人像库

仓库保留了清理后的 `public/portrait_lib_raw.json` 索引，但不内置完整人像图片包。

如需在“人像库”页面显示本地预览图，请按 [虚拟人像库集成指南](docs/PORTRAIT_LIBRARY.md) 准备 `public/portraits/`。

## 配置说明

### Gemini

在应用内的“API 配置”页填写 API Key 和默认模型即可。

### 火山引擎 Ark

Ark API Key、模型 ID / Endpoint ID、提示词语言都在“API 配置”页里维护。

### Seedance / Dreamina bridge

桌面版会自动启动内置 bridge。若使用本地 Dreamina 执行器，只需保证 `dreamina` 命令在系统环境中可用；是否连通可直接在“API 配置”页查看。

如需调试 Web 版，默认把 `/api/seedance` 代理到 `http://127.0.0.1:3210`，这时再单独启动 `npm run dev:bridge` 即可。

## 文档

- [维护者架构文档](docs/CORE.md)
- [发布流程](docs/RELEASE.md)
- [虚拟人像库集成](docs/PORTRAIT_LIBRARY.md)
- [Seedance 极速成片设计](docs/seedance-fast-video-design.md)
- [视频参考素材设计](docs/video-reference-design.md)

## 交流

如有问题可以进群讨论：

![Tapdance 交流群二维码](public/QRCode.JPG)
