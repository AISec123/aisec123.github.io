#!/usr/bin/env bash
# 把条目里的品牌图标抓到 assets/logos/ 下存成本地文件。
# 站点运行时不依赖任何第三方图标服务——Google 的 favicon 服务在部分网络里根本不通，
# favicon.im 抓不到时会回一张通用的 "f" 占位图，比首字母字标更糟。
# 所以图标只在这一步落到本地，app.js 只认 data/entries.js 里写死的本地路径。
#
# 用法：bash scripts/fetch-logos.sh
# 依赖：curl、file（macOS / Linux 自带），不需要 node
#
# 输入是一个 "来源|文件名" 清单，默认读 /tmp/logo-sources.txt，每行：
#   lakera.ai|lakera-ai          抓域名 favicon
#   org:NVIDIA|org-nvidia        抓 GitHub 组织头像（开源项目的项目方品牌）
# 已存在的文件会跳过，重跑只补新的。抓完把打印出来的文件名填进 data/entries.js 的 logo 字段。
set -u
cd "$(dirname "$0")/.."
OUT=assets/logos
SRC=${1:-/tmp/logo-sources.txt}
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
mkdir -p "$OUT"

try() { # url slug -> 0 成功
  local url="$1" slug="$2" i mime ext size
  for i in 1 2 3; do
    curl -sS -L --http1.1 -m 25 -A "$UA" -o "$OUT/$slug.dl" "$url" 2>/dev/null
    [ -s "$OUT/$slug.dl" ] || continue
    mime=$(file -b --mime-type "$OUT/$slug.dl")
    size=$(wc -c < "$OUT/$slug.dl" | tr -d ' ')
    case "$mime" in
      image/png)      ext=png  ;;
      image/jpeg)     ext=jpg  ;;
      image/svg+xml)  ext=svg  ;;
      image/x-icon|image/vnd.microsoft.icon) ext=ico ;;
      image/webp)     ext=webp ;;
      image/gif)      ext=gif  ;;
      *) rm -f "$OUT/$slug.dl"; continue ;;
    esac
    # 图标服务找不到时会回一张很小的通用占位图，200 但不是品牌
    if [ "$size" -lt 300 ] || { [ "$ext" = svg ] && [ "$size" -lt 600 ]; }; then
      rm -f "$OUT/$slug.dl"; continue
    fi
    mv "$OUT/$slug.dl" "$OUT/$slug.$ext"
    echo "$OUT/$slug.$ext"
    return 0
  done
  rm -f "$OUT/$slug.dl"
  return 1
}

[ -f "$SRC" ] || { echo "找不到来源清单：$SRC" >&2; exit 1; }

while IFS='|' read -r src slug; do
  case "$src" in ''|\#*) continue ;; esac
  if ls "$OUT/$slug".* >/dev/null 2>&1; then echo "skip  $slug"; continue; fi
  case "$src" in
    org:*)
      owner="${src#org:}"
      # 个人账号没有 /orgs 接口，所以 orgs 拿不到就退到 users，两边都是头像
      avatar=$(curl -sS --http1.1 -m 25 -A "$UA" "https://api.github.com/orgs/$owner" 2>/dev/null \
        | sed -n 's/.*"avatar_url": *"\([^"]*\)".*/\1/p' | head -1)
      [ -n "$avatar" ] || avatar=$(curl -sS --http1.1 -m 25 -A "$UA" "https://api.github.com/users/$owner" 2>/dev/null \
        | sed -n 's/.*"avatar_url": *"\([^"]*\)".*/\1/p' | head -1)
      if [ -n "$avatar" ]; then
        try "${avatar%%\?*}?size=200" "$slug" >/dev/null && { echo "ok    $slug  (github avatar)"; continue; }
      fi
      echo "MISS  $slug  $src"; continue ;;
  esac
  try "https://favicon.im/$src?larger=true" "$slug" >/dev/null && { echo "ok    $slug  (favicon.im)"; continue; }
  # 有些站不带 www 直接 302 到 HTML 页，所以两个域名都试
  for host in "$src" "www.$src"; do
    try "https://$host/favicon.ico" "$slug" >/dev/null && { echo "ok    $slug  (/favicon.ico)"; continue 2; }
    try "https://$host/apple-touch-icon.png" "$slug" >/dev/null && { echo "ok    $slug  (apple-touch-icon)"; continue 2; }
    icon=$(curl -sS -L --http1.1 -m 25 -A "$UA" "https://$host/" 2>/dev/null \
      | sed -n 's/.*<link[^>]*rel="\(apple-touch-icon\|icon\)"[^>]*href="\([^"]*\)".*/\2/p' | head -1)
    case "$icon" in
      http*) try "$icon" "$slug" >/dev/null && { echo "ok    $slug  (html link)"; continue 2; } ;;
      /*)    try "https://$host$icon" "$slug" >/dev/null && { echo "ok    $slug  (html link)"; continue 2; } ;;
    esac
  done
  echo "MISS  $slug  $src"
done < "$SRC"

echo "--- assets/logos:"
ls -S "$OUT" 2>/dev/null | head -60
