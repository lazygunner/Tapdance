`POST https://ark.cn-beijing.volcengineapi.com/?Action=CreateAsset&Version=2024-01-01`
在指定的 Asset Group（素材资产组合）内传入 Asset（素材资产）。
:::warning
上传素材 （CreateAsset） API 为异步接口，系统处理可能出现排队，导致入库时间增加。不承诺上传时间 SLA。
视频类素材处理时间更长。

:::
```mixin-react
return (<Tabs>
<Tabs.TabPane title="快速入口" key="cKd5Z9eIKF"><RenderMd content={`<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_57d0bca8e0d122ab1191b40101b5df75.png =20x) </span> [调用教程](https://www.volcengine.com/docs/82379/2333565) <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_f45b5cd5863d1eed3bc3c81b9af54407.png =20x) </span> [接口列表](https://www.volcengine.com/docs/82379/2333601) <span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_bef4bc3de3535ee19d0c5d6c37b0ffdd.png =20x) </span> [开通模型](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="鉴权说明" key="Mr1ixObTJj"><RenderMd content={`本接口仅支持 Access Key（AK/SK）鉴权。
`}></RenderMd></Tabs.TabPane></Tabs>);
```


---


<span id="request-params"></span>
## 请求参数
<span id="request-body"></span>
### 请求体

---


**GroupId** `string` %%require%%
Asset（素材资产）所属的 Asset Group（素材资产组合）的 Id。

---


**URL** `string` %%require%%
传入的 Asset（素材资产）的公共可访问地址（URL）。

---


**Name** `string`
Asset（素材资产）的名称，上限为 64 个字符。
**注意**：该字段仅用于使用 ListAssets 接口时模糊搜索素材，不会被带入模型推理。关于如何使用素材生成视频，请参考[使用人像素材生成视频](https://www.volcengine.com/docs/82379/2291680?lang=zh#2bf01416)和[常见问题 4](https://www.volcengine.com/docs/82379/2333565?lang=zh#%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98)。

---


**AssetType** `string` %%require%%
Asset（素材资产）的类型，支持传入图像、视频、音频。可选值：

* `Image`：图像
* `Video`：视频
* `Audio`：音频

:::tip
传入图像、视频、音频素材时，仅支持上传 URL，不支持 Base64。
**传入单个图像要求**

* 格式：jpeg、png、webp、bmp、tiff、gif、heic、heif
* 宽高比（宽/高）：(0.4, 2.5)
* 宽高长度（px）：(300, 6000)
* 大小：单张图片小于 30 MB

**传入单个视频要求**

* 格式：mp4、mov
* 分辨率：480p、720p
* 时长：单个视频时长 [2, 15] s
* 尺寸：
   * 宽高比（宽/高）：[0.4, 2.5]
   * 宽高长度（px）：[300, 6000]
   * 总像素数：宽×高 ∈ [409600, 927408]
* 大小：单个视频不超过 50 MB
* 帧率（FPS）：[24, 60]

**传入单个音频要求**

* 格式：wav、mp3
* 时长：单个音频时长 [2, 15] s
* 大小：单个音频不超过 15 MB


:::
---


**ProjectName** `string`
资源所属的项目名称，默认值为default。
若资源不在默认项目中，需填写正确的项目名称，获取项目名称，请查看 [文档](https://www.volcengine.com/docs/82379/1359411?lang=zh#03ec4a65)。
**注意**：需要和待传入的 Asset Group（素材资产组合）的 **ProjectName ** 保持一致。
<span id="9D2nd9Lb"></span>
## 响应参数

---


**Id** `string`
Asset（素材资产）的 Id（Asset ID）。

---


<span id=".6K-35rGC56S65L6L"></span>
## 请求示例
```text
POST /?Action=CreateAsset&Version=2024-01-01 HTTP/1.1
Host: ark.cn-beijing.volcengineapi.com
Content-Type: application/json
X-Date: 20260328T000000Z
X-Content-Sha256: 287e874e******d653b44d21e
Authorization: HMAC-SHA256 Credential=AKLTYz******/20260328/cn-beijing/ark/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=47a7d934******e41085f

{
  "GroupId": "group-2026**********-*****",
  "URL": "https://example.com/image.jpg",
  "Name": "test",
  "AssetType": "Image",
  "ProjectName": "default"
}
```

<span id=".5ZON5bqU56S65L6L"></span>
## 响应示例
```json
{
  "ResponseMetadata": {
    "RequestId": "20260328000000000000000000000000",
    "Action": "CreateAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {
    "Id": "Asset-2026**********-*****"
  }
}
```



