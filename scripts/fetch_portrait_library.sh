#!/bin/bash

# ============================================================
# 虚拟人物库全量抓取脚本（含图片下载）
#
# 使用方式：
#   1. 在 Chrome DevTools 中右键请求 → Copy as cURL
#   2. 直接运行（脚本自动从剪贴板读取）：
#      bash scripts/fetch_portrait_library.sh
#
# 断点续传：cookie 过期后，重新复制 curl 到剪贴板，再运行脚本即可
# 重新开始：rm -rf tmp/portrait_pages/ 后重新运行
# 只合并已有数据（不下载图片）：bash scripts/fetch_portrait_library.sh --merge
# 重新获取新URL并下载图片：bash scripts/fetch_portrait_library.sh --refetch-images
#
# 输出文件：public/portrait_lib_raw.json
# 图片目录：public/portraits/
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_FILE="$PROJECT_ROOT/public/portrait_lib_raw.json"
PORTRAITS_DIR="$PROJECT_ROOT/public/portraits"
PAGES_DIR="$PROJECT_ROOT/tmp/portrait_pages"
PROGRESS_FILE="$PAGES_DIR/.progress"
IMG_PROGRESS_FILE="$PAGES_DIR/.img_progress"
CURL_FILE="$PAGES_DIR/.curl_cmd.txt"
PAGE_SIZE=30

mkdir -p "$PAGES_DIR"
mkdir -p "$PORTRAITS_DIR"

# ============================================================
# 下载单个页面中的所有图片（Python，支持并行）
# 参数：页面 JSON 文件路径
# ============================================================
download_images_from_page() {
  local PAGE_FILE="$1"
  python3 << PYEOF
import json, os, sys, subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

portraits_dir = "$PORTRAITS_DIR"
page_file = "$PAGE_FILE"

try:
    with open(page_file) as f:
        d = json.load(f)
except Exception as e:
    print(f"  ⚠️  无法解析页面: {e}")
    sys.exit(0)

items = d.get('Result', {}).get('Items', [])
tasks = []
for item in items:
    ag = item.get('AssetGroup', {})
    for img in ag.get('Content', {}).get('Image', []):
        url = img.get('URL', '')
        asset_id = img.get('AssetID', '')
        if not url or not asset_id:
            continue
        ext = 'png'
        if '.jpg' in url or '.jpeg' in url:
            ext = 'jpg'
        elif '.webp' in url:
            ext = 'webp'
        dest = os.path.join(portraits_dir, f'{asset_id}.{ext}')
        if os.path.isfile(dest) and os.path.getsize(dest) > 0:
            continue  # 已存在，跳过
        tasks.append((url, dest, asset_id))

if not tasks:
    sys.exit(0)

ok = 0
fail = 0
def dl(t):
    url, dest, aid = t
    try:
        # 使用系统 curl 下载，避开 Python 的 SSL 问题
        res = subprocess.run(['curl', '-sL', '-k', '-o', dest, url], timeout=30)
        if res.returncode == 0 and os.path.isfile(dest) and os.path.getsize(dest) > 0:
            return True
        return False
    except:
        if os.path.isfile(dest):
            os.remove(dest)
        return False

with ThreadPoolExecutor(max_workers=8) as pool:
    futs = {pool.submit(dl, t): t for t in tasks}
    for f in as_completed(futs):
        if f.result():
            ok += 1
        else:
            fail += 1

if fail > 0:
    print(f"  🖼️  图片: {ok} 成功, {fail} 失败")
else:
    print(f"  🖼️  {ok} 张图片已下载")
PYEOF
}

# ============================================================
# 合并所有页面 + 替换 URL 为本地路径 → 生成最终 JSON
# ============================================================
build_final_json() {
  echo ""
  echo "📦 正在合并数据并生成最终 JSON ..."
  python3 << PYEOF
import json, glob, os, datetime

pages_dir = "$PAGES_DIR"
portraits_dir = "$PORTRAITS_DIR"
output_file = "$OUTPUT_FILE"

all_items = []
page_files = sorted(
    glob.glob(os.path.join(pages_dir, 'page_*.json')),
    key=lambda f: int(os.path.basename(f).replace('page_','').replace('.json',''))
)
print(f'  找到 {len(page_files)} 个页面文件')
for pf in page_files:
    try:
        with open(pf) as f:
            d = json.load(f)
        items = d.get('Result', {}).get('Items', [])
        all_items.extend(items)
    except Exception as e:
        print(f'  ⚠️  跳过: {os.path.basename(pf)}: {e}')

# 替换 URL 为本地路径
local_count = 0
remote_count = 0
for item in all_items:
    ag = item.get('AssetGroup', {})
    for img in ag.get('Content', {}).get('Image', []):
        url = img.get('URL', '')
        asset_id = img.get('AssetID', '')
        if not asset_id:
            continue
        ext = 'png'
        if '.jpg' in url or '.jpeg' in url:
            ext = 'jpg'
        elif '.webp' in url:
            ext = 'webp'
        local_file = os.path.join(portraits_dir, f'{asset_id}.{ext}')
        if os.path.isfile(local_file) and os.path.getsize(local_file) > 0:
            img['URL'] = f'/portraits/{asset_id}.{ext}'
            local_count += 1
        else:
            remote_count += 1

output = {
    '_meta': {
        'description': '火山方舟虚拟人物库全量数据',
        'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'totalItems': len(all_items),
        'source': 'volcengine.com ListMediaAssetGroup API',
        'type': 'portrait',
        'imagesDir': 'public/portraits/',
    },
    'items': all_items,
}
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f'  ✅ 共 {len(all_items)} 条记录')
print(f'  🖼️  本地图片: {local_count}，远程URL: {remote_count}')
print(f'  📁 保存到: {output_file}')
PYEOF
}

# ============================================================
# 重新获取所有页面的新 URL 并下载缺失的图片
# 需要剪贴板中有有效的 curl 命令
# ============================================================
refetch_and_download_images() {
  echo "📋 从剪贴板读取 curl 命令..."
  pbpaste > "$CURL_FILE" 2>/dev/null

  if [ ! -s "$CURL_FILE" ] || ! grep -q "PageNum" "$CURL_FILE"; then
    echo "❌ 需要有效的 curl 命令来获取新的图片 URL"
    exit 1
  fi

  # 统计需要下载的图片数
  TOTAL_PAGES=$(ls "$PAGES_DIR"/page_*.json 2>/dev/null | wc -l | tr -d ' ')
  echo "🔄 将重新请求 ${TOTAL_PAGES} 页以获取新的图片签名 URL..."
  echo ""

  for PAGE_NUM in $(seq 1 "$TOTAL_PAGES"); do
    echo -n "📄 第 ${PAGE_NUM}/${TOTAL_PAGES} 页... "

    # 用临时文件存放带新 URL 的页面
    TEMP_PAGE="$PAGES_DIR/.refetch_page.json"
    CURL_RUN="$PAGES_DIR/.curl_run.sh"
    sed "s/\"PageNum\":[0-9]*/\"PageNum\":${PAGE_NUM}/g" "$CURL_FILE" \
      | sed "s/\"PageSize\":[0-9]*/\"PageSize\":${PAGE_SIZE}/g" \
      | sed "s|^curl |curl -s -o '$TEMP_PAGE' -w '%{http_code}' |" \
      > "$CURL_RUN"

    HTTP_CODE=$(bash "$CURL_RUN" 2>/dev/null)

    if [ "$HTTP_CODE" != "200" ]; then
      echo "❌ HTTP ${HTTP_CODE}"
      if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        echo "⚠️  Cookie 过期，已处理到第 $((PAGE_NUM - 1)) 页。请重新复制 curl 后再运行。"
      fi
      rm -f "$TEMP_PAGE"
      break
    fi

    # 下载这个页面的图片
    download_images_from_page "$TEMP_PAGE"

    echo "✅"
    rm -f "$TEMP_PAGE"
    sleep 0.3
  done

  build_final_json
  echo ""
  echo "🎉 图片下载完成！"
}

# ============================================================
# 参数处理
# ============================================================
if [ "$1" = "--merge" ]; then
  build_final_json
  exit 0
fi

if [ "$1" = "--refetch-images" ]; then
  refetch_and_download_images
  exit 0
fi

# ============================================================
# 检查某个 JSON 页面文件中的所有图片是否已在本地下载完成
# 参数：页面 JSON 文件路径
# ============================================================
check_page_images_exist() {
  local PAGE_FILE="$1"
  python3 << PYEOF
import json, os, sys

portraits_dir = "$PORTRAITS_DIR"
page_file = "$PAGE_FILE"

if not os.path.isfile(page_file):
    print("MISSING")
    sys.exit(0)

try:
    with open(page_file) as f:
        d = json.load(f)
except:
    print("ERROR")
    sys.exit(0)

items = d.get('Result', {}).get('Items', [])
if not items:
    print("EMPTY")
    sys.exit(0)

missing = 0
for item in items:
    ag = item.get('AssetGroup', {})
    for img in ag.get('Content', {}).get('Image', []):
        url = img.get('URL', '')
        asset_id = item.get('AssetGroup', {}).get('AssetID', '')
        if not asset_id:
            # Try nested AssetID if not at top level
            asset_id = img.get('AssetID', '')
        
        if not asset_id: continue
        ext = 'png'
        if '.jpg' in url or '.jpeg' in url: ext = 'jpg'
        elif '.webp' in url: ext = 'webp'
        dest = os.path.join(portraits_dir, f'{asset_id}.{ext}')
        if not (os.path.isfile(dest) and os.path.getsize(dest) > 0):
            missing += 1

if missing == 0:
    print("READY")
else:
    print(f"MISSING_{missing}")
PYEOF
}

# ============================================================
# 主流程：从剪贴板读取 curl → 抓取页面 → 即时下载图片 → 生成 JSON
# ============================================================
echo "📋 从剪贴板读取 curl 命令..."
pbpaste > "$CURL_FILE" 2>/dev/null

if [ ! -s "$CURL_FILE" ]; then
  echo "❌ 剪贴板为空！"
  echo "使用方式：在 Chrome DevTools 复制 curl，然后再运行脚本。"
  exit 1
fi

if ! grep -q "PageNum" "$CURL_FILE"; then
  echo "❌ 剪贴板内容不包含 PageNum，不是正确的 curl 命令"
  exit 1
fi

CURL_SIZE=$(wc -c < "$CURL_FILE" | tr -d ' ')
echo "✅ curl 命令已读取 (${CURL_SIZE} 字节)"
echo "🚀 开始获取虚拟人物库数据（每页 ${PAGE_SIZE} 条）..."
echo ""

PAGE_NUM=1

while true; do
  echo -n "📄 第 ${PAGE_NUM} 页... "

  PAGE_FILE="$PAGES_DIR/page_${PAGE_NUM}.json"

  # 检查是否可以跳过
  PAGE_STATE=$(check_page_images_exist "$PAGE_FILE")
  
  if [ "$PAGE_STATE" = "READY" ]; then
    ITEM_COUNT=$(python3 -c "import json; d=json.load(open('$PAGE_FILE')); print(len(d.get('Result',{}).get('Items',[])))" 2>/dev/null)
    echo "✅ ${ITEM_COUNT} 条 (图片已本地就绪，跳过)"
    
    # 仍需判断是否是最后一页以结束循环
    if [ "$ITEM_COUNT" -eq 0 ] || [ "$ITEM_COUNT" -lt "$PAGE_SIZE" ]; then
      break
    fi
    
    PAGE_NUM=$((PAGE_NUM + 1))
    continue
  fi

  # 如果不跳过，则执行请求
  # 生成当前页的 curl 脚本
  CURL_RUN="$PAGES_DIR/.curl_run.sh"
  sed "s/\"PageNum\":[0-9]*/\"PageNum\":${PAGE_NUM}/g" "$CURL_FILE" \
    | sed "s/\"PageSize\":[0-9]*/\"PageSize\":${PAGE_SIZE}/g" \
    | sed "s|^curl |curl -s -o '$PAGE_FILE' -w '%{http_code}' |" \
    > "$CURL_RUN"

  # 执行 curl
  HTTP_CODE=$(bash "$CURL_RUN" 2>"$PAGES_DIR/.curl_err")

  # curl 执行失败
  if [ -z "$HTTP_CODE" ]; then
    echo "❌ curl 执行失败"
    cat "$PAGES_DIR/.curl_err" 2>/dev/null | head -3
    exit 1
  fi

  # HTTP 错误
  if [ "$HTTP_CODE" != "200" ]; then
    echo "❌ HTTP ${HTTP_CODE}"
    rm -f "$PAGE_FILE"
    if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
      echo ""
      echo "⚠️  Cookie 已过期！"
      echo "   请重新登录后在 DevTools 复制 curl，然后重新运行脚本即可继续。"
    fi
    exit 1
  fi

  # API 错误检查
  ERROR_CODE=$(python3 -c "import json; d=json.load(open('$PAGE_FILE')); e=d.get('ResponseMetadata',{}).get('Error',{}); print(e.get('Code',''))" 2>/dev/null)

  if [ -n "$ERROR_CODE" ]; then
    echo "❌ API: $ERROR_CODE"
    rm -f "$PAGE_FILE"
    if [ "$ERROR_CODE" = "NotLogin" ]; then
      echo ""
      echo "⚠️  登录失效！"
      echo "   请重新登录后在 DevTools 复制 curl，然后重新运行脚本即可继续。"
    fi
    exit 1
  fi

  # 解析结果: Items 数量和 Total
  PARSE_RESULT=$(python3 -c "
import json
d=json.load(open('$PAGE_FILE'))
result=d.get('Result',{})
items=result.get('Items',[])
total=result.get('Total','?')
print(f'{len(items)} {total}')
" 2>/dev/null || echo "0 ?")
  ITEM_COUNT=$(echo "$PARSE_RESULT" | awk '{print $1}')
  TOTAL=$(echo "$PARSE_RESULT" | awk '{print $2}')

  # 首次显示总数
  if [ "$PAGE_NUM" -le 1 ]; then
    echo -n "(总计 ${TOTAL} 条) "
  fi

  echo -n "✅ ${ITEM_COUNT} 条 "

  # ⭐ 立即下载本页的图片（URL 此刻是新鲜的）
  download_images_from_page "$PAGE_FILE"

  # 结束判断
  if [ "$ITEM_COUNT" -eq 0 ]; then
    echo ""
    echo "✅ 没有更多数据。"
    break
  fi
  if [ "$ITEM_COUNT" -lt "$PAGE_SIZE" ]; then
    echo ""
    echo "✅ 最后一页（${ITEM_COUNT} < ${PAGE_SIZE}），全部获取完成！"
    break
  fi

  PAGE_NUM=$((PAGE_NUM + 1))
  sleep 0.3
done

# 统计 & 生成最终 JSON
TOTAL_PAGES=$(ls "$PAGES_DIR"/page_*.json 2>/dev/null | wc -l | tr -d ' ')
TOTAL_IMAGES=$(ls "$PORTRAITS_DIR"/*.png "$PORTRAITS_DIR"/*.jpg "$PORTRAITS_DIR"/*.webp 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "📊 共获取 ${TOTAL_PAGES} 页，${TOTAL_IMAGES} 张图片"

build_final_json

echo ""
echo "🎉 全部完成！"
echo "💡 清理临时文件：rm -rf tmp/portrait_pages/"
