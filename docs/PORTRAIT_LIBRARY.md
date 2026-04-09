# 虚拟人像库 (Portrait Library) 集成指南

为了确保人像库图片的可用性和加载性能，系统支持将人像库图片本地化存储。由于图片素材较多（约 3000+ 张），推荐从网盘下载预处理好的素材包。

## 1. 下载素材包

你可以从以下链接下载完整的人像图片素材包：

*   **下载链接**：[https://pan.quark.cn/s/48caf9810a81](https://pan.quark.cn/s/48caf9810a81)
*   **提取码**：`67jh`
*   **内容说明**：包含约 3000 张以 `AssetID` 命名的 PNG/JPG 图片。

## 2. 集成步骤

下载完成后，请按照以下步骤集成到项目中：

1.  **解压素材**：将下载的 `portraits.zip` 解压。
2.  **放置目录**：将解压后的 `portraits` 文件夹整体放入项目的 `public/` 目录下。
    *   正确路径应为：`public/portraits/*.png`
3.  **生成索引**：运行项目根目录下的脚本，自动扫描本地图片并生成前端所需的 JSON 索引文件：
    ```bash
    sh scripts/fetch_portrait_library.sh --merge
    ```
    *   该脚本会扫描 `public/portraits/` 下的文件，并将 `public/portrait_lib_raw.json` 中的远程过期 URL 替换为本地路径（如 `/portraits/xxx.png`）。

## 3. 常见问题

### 为什么需要本地化？
火山引擎素材库返回的图片 URL 带有时间戳签名，通常在几小时内就会失效。通过本地化存储，可以确保在任何时候打开“人像库”都能正常预览，且提交视频生成任务时能自动转换为 Base64 提高成功率。

### 如何更新人像库？
如果火山引擎后台更新了素材，你可以通过以下命令同步新素材（需要从浏览器复制新的 cURL 命令）：
```bash
sh scripts/fetch_portrait_library.sh
```
该脚本会自动智能跳过已存在的图片，仅下载增量更新。

### Git 忽略
为了避免将数千张二进制图片提交到代码仓库，项目已在 `.gitignore` 中配置忽略 `public/portraits/`。每位开发者需按照上述步骤手动下载并配置。
