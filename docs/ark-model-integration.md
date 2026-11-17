# Ark 模型接入（2026-11-17）

画布创作组件、视频创作与模型设置共用以下模型配置。保留已有自定义 endpoint，新字段在旧设置载入时补齐；请求继续使用火山引擎的 API Key 和 base URL。

| 模型 | 默认模型 ID | 当前应用支持 |
| --- | --- | --- |
| Seedance 2.0 | doubao-seedance-2-0-260128 | 4–15 秒；480p/720p/1080p；MP4 |
| Seedance 2.0 Fast | doubao-seedance-2-0-fast-260128 | 4–15 秒；480p/720p；MP4 |
| Seedance 2.0 Mini | doubao-seedance-2-0-mini-260615 | 4–15 秒；480p/720p；MP4 |
| Seedance 2.5 | doubao-seedance-2-5-260628 | 4–30 秒；480p/720p/1080p；MP4/MOV |
| Seedance 2.5 Flash | doubao-seedance-2-5-flash-261115 | 4–30 秒；480p/720p；MP4/MOV |
| Seedream 5.5 | doubao-seedream-5-5-261028 | 文生图、参考图；2K，提示词携带所选画幅比例 |

2.5/Flash 支持纯音频参考；Flash 的图片/视频/音频参考上限分别为 10/5/5，2.5 为 30/10/10。切换模型会规范化不支持的分辨率、时长及输出格式。项目保存与重开保留 Mini/Flash 型号。

Mini/Flash 尚未配置可靠单价，界面明确显示“未配置单价 / 暂不估算”，费用以服务商账单为准。本次不扩展应用现有分辨率类型到 4K，不改变 CLI 支持的型号。

验证覆盖配置迁移、模型选择、能力限制、请求体及持久化。自动化使用模拟请求，未发起付费生成；真实可用性取决于账号模型开通权限。

官方参考：
- https://docs.volcengine.com/docs/ark/create-video-generation-task-api?lang=zh
- https://docs.volcengine.com/docs/ark/seedance-2-0?lang=zh
- https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh
- https://docs.volcengine.com/docs/ark/seedream-5-5?lang=en
