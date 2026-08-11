# Tapdance

English | [中文](README_zh.md)

An AI director's workbench that turns a single creative idea into a structured brief, character and scene assets, storyboards, first- and last-frame prompts, video prompts, and pollable video-generation tasks.

Tapdance is primarily an `Electron + React + Vite + TypeScript` desktop application. It supports `Google Gemini / Veo`, `Volcengine Ark`, `MiniMax H3`, and `Alibaba Cloud Model Studio HappyHorse`, and also provides a local Seedance / Dreamina bridge and a mock demo workflow.

## Features

- Generate a structured `Brief` from a creative idea
- Generate and maintain consistent assets for characters, scenes, products, and more
- Generate storyboard lists, first- and last-frame prompts, image prompts, and video prompts
- Support single-shot video, transition video, and fast video workflows
- Support Gemini / Veo, Volcengine Ark, MiniMax H3, Alibaba Cloud Model Studio, and the Seedance bridge
- Override models by workflow stage or individual operation
- Run the main workflow without API credentials using Mock mode
- Store projects, API settings, request logs, assets, and UI preferences locally

## Getting Started

We recommend using the desktop application. It automatically starts the bundled bridge and persists projects, settings, request logs, and asset data in the local application directory. The web version is better suited to UI development and debugging.

### 1. Prerequisites

- Node.js 22+ recommended
- npm
- For local Seedance / Dreamina workflows, make sure the `dreamina` command is available on your system

### 2. Install dependencies

```bash
npm install
```

### 3. Start the desktop application

```bash
npm run dev:electron
```

This will:

- Open the Electron desktop application
- Start the bundled Seedance bridge automatically
- Connect to local persistent storage automatically

### 4. Recommended first-time setup

1. Open **API Settings** and configure Gemini, Volcengine Ark, MiniMax, Alibaba Cloud Model Studio, TOS, and any other services you need.
2. Select the default text, image, and video models.
3. If you do not have model credentials yet, enable `Mock` mode to try the main workflow.
4. If you use the local Dreamina runner, confirm that the Seedance health check passes on the settings page.

### 5. Recommended workflow

1. Create a project and enter a creative idea.
2. Generate a structured `Brief`.
3. Add consistent character, scene, product, and other assets.
4. Generate storyboards, first- and last-frame prompts, and video prompts.
5. Submit tasks from **Video** or **Fast Video**, then poll for the results.

### 6. Basic checks

```bash
npm test
npm run lint
npm run build:electron
```

## Common Commands

```bash
npm run dev:electron # Recommended: start the desktop development environment
npm run build:electron
npm run pack:mac
npm run pack:win
npm run dev:web      # Frontend UI debugging only
npm run dev:bridge   # Run the local bridge separately for debugging
npm run dev          # Start Vite and the standalone bridge together (mainly for web debugging)
npm test
npm run lint
npm run build
npm run preview
```

## Portrait Library

The repository includes the cleaned `public/portrait_lib_raw.json` index, but does not include the complete portrait image package.

To display local preview images on the **Portrait Library** page, follow the [Portrait Library Integration Guide](docs/PORTRAIT_LIBRARY.md) to prepare `public/portraits/`.

## Configuration

### Gemini

Enter your API key and default model on the application's **API Settings** page.

### Volcengine Ark

The Ark API key, model ID / endpoint ID, and prompt language are managed on the **API Settings** page.

### MiniMax H3

Enter your MiniMax API key and optional base URL on the **API Settings** page. MiniMax H3 is available in the video-generation and Fast Video workflows, including task submission, status polling, result retrieval, and task cancellation.

### Alibaba Cloud Model Studio (HappyHorse)

Enter the Model Studio API key and optional base URL on the **API Settings** page. When a generation task includes reference images, the application uploads those resources directly through Model Studio's temporary OSS interface.

### Seedance / Dreamina bridge

The desktop application starts the bundled bridge automatically. To use the local Dreamina runner, make sure the `dreamina` command is available in your system environment. You can check its connection status directly on the **API Settings** page.

For web development, `/api/seedance` is proxied to `http://127.0.0.1:3210` by default. Start the bridge separately with `npm run dev:bridge`.

## Documentation

- [Maintainer Architecture Guide](docs/CORE.md)
- [Release Process](docs/RELEASE.md)
- [Portrait Library Integration](docs/PORTRAIT_LIBRARY.md)
- [Seedance Fast Video Design](docs/seedance-fast-video-design.md)
- [Video Reference Asset Design](docs/video-reference-design.md)
- [HappyHorse API Integration](docs/happyhorse/api-docs.md)

## Community

Join the community chat if you have any questions:

![Tapdance community chat QR code](public/QRCode.JPG)
