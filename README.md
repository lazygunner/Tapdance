# Tapdance

AI 导演工作台。把一句创意想法逐步整理成 Brief、角色 / 场景资产、分镜、首尾帧提示词、视频提示词和可轮询的视频生成任务。

当前项目基于 `React + Vite + TypeScript`，支持 `Google Gemini / Veo`、`火山引擎 Ark`，并提供本地 Seedance / Dreamina bridge 和 Mock 演示流程。

## 功能

- 创意输入后生成结构化 `Brief`
- 生成并维护角色、场景、商品等一致性资产
- 生成分镜列表、首帧 / 尾帧提示词、图像提示词、视频提示词
- 支持单镜头视频、转场视频、极速成片工作流
- 支持 Gemini / Veo、火山引擎 Ark、Seedance bridge
- 支持按流程阶段或单次操作覆盖模型
- 支持 Mock 模式，无密钥时也能演示主流程
- 本地保存项目、API 配置、调用日志、素材库和界面偏好

## 项目初始化

### 1. 环境准备

- Node.js 22+ 推荐
- npm
- 至少一套可用模型凭证

可选能力：

- Gemini API Key
- 火山引擎 Ark API Key
- 火山引擎 TOS AccessKey / Bucket，用于上传视频参考素材
- `dreamina` CLI，用于本地 Seedance bridge 流程

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制示例配置：

```bash
cp .env.example .env
```

最小可用配置：

```bash
GEMINI_API_KEY="your_gemini_api_key"
```

也可以不写 `.env`，启动后在应用里的“API 配置”页填写 Gemini / Ark / TOS 等配置。

### 4. 启动开发环境

```bash
npm run dev
```

默认会启动两个进程：

- 前端：`http://127.0.0.1:3001`
- 本地 Seedance bridge：`http://127.0.0.1:3210`

### 5. 验证

```bash
npm test
npm run lint
npm run build
```

如果暂时没有模型密钥，可以在应用里开启 `Mock` 模式，先跑通 Brief、资产、分镜、图片和视频占位结果。

## 常用命令

```bash
npm run dev          # 同时启动 bridge 和 Vite
npm run dev:web      # 只启动 Vite
npm run dev:bridge   # 只启动本地 bridge
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

可通过 `.env` 配置：

```bash
GEMINI_API_KEY="your_gemini_api_key"
```

也可在应用内的“API 配置”页填写。

### 火山引擎 Ark

Ark API Key、模型 ID / Endpoint ID、提示词语言都在“API 配置”页里维护。

### Seedance / Dreamina bridge

本地 bridge 默认监听 `3210` 端口，Vite 默认把 `/api/seedance` 代理到 `http://127.0.0.1:3210`。

可选环境变量：

```bash
SEEDANCE_BRIDGE_PORT=3210
SEEDANCE_CLI_BIN="dreamina"
VITE_SEEDANCE_BRIDGE_TARGET="http://127.0.0.1:3210"
RENREN_APP_DATA_DIR="./local_data"
```

## 文档

- [维护者架构文档](docs/CORE.md)
- [发布流程](docs/RELEASE.md)
- [虚拟人像库集成](docs/PORTRAIT_LIBRARY.md)
- [Seedance 极速成片设计](docs/seedance-fast-video-design.md)
- [视频参考素材设计](docs/video-reference-design.md)

## 交流

如有问题可以进群讨论：

![Tapdance 交流群二维码](public/QRCode.JPG)
