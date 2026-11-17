# v0.1.29

包含无限画布创作组件、引用素材和 Seedance 2.0 / Fast / Mini、Seedance 2.5 / Flash、Seedream 5.5 模型接入。

修复 v0.1.28 在 macOS CI 签名阶段失败的问题：将 electron-builder 从 26.8.1 固定升级至 26.16.1。旧版在 security set-key-partition-list 中错误地使用证书导入密码，新版使用临时钥匙串自身的密码。保留原有签名证书、公证设置及安装包平台。

官方修复：https://www.electron.build/changelog/#26161

本地验证：Electron 构建、TypeScript 检查和版本标签校验。签名与公证由 GitHub Actions 使用现有 Secrets 验证。
