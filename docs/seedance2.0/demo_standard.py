# 方舟视频生成 SDK 使用示例 (Python)

# 这是一个标准的 Python 开发示例，展示了如何使用 volcenginesdkarkruntime 库调用 Seedance 2.0 视频生成模型，包含完整的任务创建和状态轮询逻辑。
# 这是一个视频编辑任务的示例，模型会根据你提供的文本提示词、参考图片和参考视频，生成一段编辑后的新视频。

import os
import time
import webbrowser
from volcenginesdkarkruntime import Ark

def main():
    print("------------------------------------------------------------------------------------------------------------------------------------------------------")
    print("   Seedance 2.0 视频生成 Python SDK 示例：展示一个 seedance 2.0 视频编辑任务，模型会根据文本提示词和输入图片，对输入的视频进行编辑，生成符合要求的新视频")
    print("------------------------------------------------------------------------------------------------------------------------------------------------------")

    # 1. 获取 API Key
    # 在正式开发中，推荐使用环境变量管理 API Key，避免硬编码在代码中。
    api_key = os.environ.get("ARK_API_KEY")
    if api_key:
        masked_key = f"...{api_key[-6:]}" if len(api_key) > 6 else "***"
        print(f"检测到本地环境变量中已存在 ARK_API_KEY (尾号: {masked_key})")
        choice = input("是否直接使用该环境变量？[Y/n] (默认: Y): ").strip().lower()
        if choice in ['n', 'no']:
            api_key = input("请输入您的 API Key (回车确认): ").strip()
            if not api_key:
                print("API Key 不能为空！")
                return
            os.environ["ARK_API_KEY"] = api_key
    else:
        print("欢迎使用！我们需要您的 API Key 来调用模型服务。")
        api_key = input("请输入您的 API Key (回车确认): ").strip()
        if not api_key:
            print("API Key 不能为空！")
            return
        # 设置到环境变量中 (仅当前进程有效)
        os.environ["ARK_API_KEY"] = api_key

    # 2. 初始化客户端
    # 这一步会创建一个 Ark 客户端实例，用于后续的所有 API 调用。
    client = Ark(api_key=api_key)

    # 3. 配置生视频参数
    # model: 模型 ID，请确保您已在控制台开通该模型
    # 注意：请使用具体的 Model ID（例如 doubao-seedance-2-0-260128），或者具体的 Endpoint ID (ep-xxxx)
    model_id = "doubao-seedance-2-0-260128"
    
    # 预置内容
    user_content = "将视频1礼盒中的香水替换成图片1中的面霜，运镜不变"
    reference_image_url = "https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_edit_pic1.jpg"
    reference_video_url = "https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_edit_video1.mp4"
    # reference_audio_url 输入参考音频
    # reference_audio_url = "https://xxx.mp3"   
    
    print("\n==================================================")
    print("   创建 seedance 2.0 视频编辑任务")
    print("==================================================")
    print(f"模型 ID   : {model_id}")
    print(f"文本提示词: {user_content}")
    print(f"输入的参考图片  : {reference_image_url}")
    print(f"输入的参考视频  : {reference_video_url}")
    print("--------------------------------------------------")
    
    # 尝试自动打开浏览器预览素材
    print("正在尝试在浏览器中打开参考图片和视频供您预览...")
    try:
        # 为了防止浏览器直接下载 mp4/jpg，生成一个简单的本地 HTML 页面来展示它们
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Seedance 2.0 视频编辑任务 - 素材预览</title>
            <style>
                body {{ font-family: sans-serif; margin: 40px; background: #f5f5f5; }}
                .container {{ display: flex; gap: 40px; }}
                .box {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
                img, video {{ max-width: 400px; max-height: 400px; border: 1px solid #ddd; }}
                h3 {{ margin-top: 0; }}
                .prompt {{ background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-size: 18px; }}
            </style>
        </head>
        <body>
            <h2>Seedance 2.0 视频编辑任务 - 输入素材预览</h2>
            <div class="prompt"><strong>提示词：</strong> {user_content}</div>
            <div class="container">
                <div class="box">
                    <h3>参考图片 (替换目标)</h3>
                    <img src="{reference_image_url}" alt="参考图片">
                </div>
                <div class="box">
                    <h3>参考视频 (原视频)</h3>
                    <video src="{reference_video_url}" controls autoplay loop muted></video>
                </div>
            </div>
        </body>
        </html>
        """
        
        preview_file_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "preview.html"))
        with open(preview_file_path, "w", encoding="utf-8") as f:
            f.write(html_content)
            
        # 使用 file:// 协议打开本地 html
        webbrowser.open(f"file://{preview_file_path}")
    except Exception as e:
        print(f"自动打开预览失败: {e}，请手动复制链接在浏览器中打开。")

    print("--------------------------------------------------")
    print(f"正在调用模型创建生成任务...")
    
    try:
        # 创建生成任务
        create_result = client.content_generation.tasks.create(
            model=model_id,
            content=[
                {
                    "type": "text",
                    "text": user_content,
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": reference_image_url
                    },
                    "role": "reference_image",
                },
                {
                    "type": "video_url",
                    "video_url": {
                        "url": reference_video_url
                    },
                    "role": "reference_video",
                },
                # {
                #     "type": "audio_url",
                #     "audio_url": {
                #         "url": reference_audio_url
                #     },
                #     "role": "reference_audio",
                # },
            ],
            generate_audio=True,
            ratio="16:9",
            duration=5,
            watermark=True,
        )

        task_id = create_result.id
        print(f"任务创建成功！任务 ID: {task_id}")
        print("正在轮询任务状态，这可能需要几分钟时间，请耐心等待...")

        # 4. 轮询并打印结果
        while True:
            get_result = client.content_generation.tasks.get(task_id=task_id)
            status = get_result.status
            
            if status == "succeeded":
                print("\n任务已完成！")
                print("--------------------------------------------------")
                print("生成的视频 URL：您可下载到本地查看")
                print(get_result.content.video_url)
                print("--------------------------------------------------")
                break
            elif status == "failed":
                print(f"\n任务失败: {get_result.error}")
                break
            else:
                print(f"当前状态: {status}，30秒后再次查询...")
                time.sleep(30)

    except Exception as e:
        print(f"\n调用失败: {e}")
        print("可能的原因：")
        print("1. API Key 无效")
        print("2. 未获得 seedance2.0 模型公测权限，申请链接：<https://www.volcengine.com/contact/seedance2-0public>")
        print("3. 未开通 seedance2.0 模型，请在控制台开通：<https://console.volcengine.com/ark/region:ark+ap-southeast-1/openManagement?LLM=%7B%7D&advancedActiveKey=model&tab=ComputerVision>")
        print("4. 网络连接问题")


if __name__ == "__main__":
    main()
