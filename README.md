# AISec123 · 全网最全 AI 安全知识图谱

AI 安全公司 / 开源项目 / 深度文章 / 标准与数据集的一站式索引。

**https://aisec123.github.io**

## 这是什么

纯静态、零构建：没有 npm、没有打包、没有 CI。

```
index.html          页面骨架（文案用 data-zh / data-en 双语属性）
assets/style.css    全站唯一样式表，配色变量与博客主题 yoyo 一致
assets/app.js       左栏分类、搜索、排序、视图、双语、暗色、URL 状态同步
assets/hero-bg.jpg  hero 面板底图，由 scripts/gen-hero-bg.py 生成
assets/brand-lockup.png  页头品牌锁定图·浅色主题版，由 scripts/make-brand-lockup.py 生成
assets/brand-lockup-glow.png  同上·暗色主题提亮版（「Sec」深蓝抬到 4.2:1）
assets/logo.jpg     站点自身品牌标原图（447×447，改标只换这一张）
assets/logo.png     上面那张压到 96px，页头用
assets/logo-32.png / assets/apple-touch-icon.png / assets/og.png
                    favicon / 桌面图标 / 分享卡片，都由 logo.jpg 派生（命令见下）
assets/logos/       条目的品牌图标（本地文件，见 scripts/fetch-logos.sh）
data/entries.js     ★ 唯一的数据源，加条目只改这里
robots.txt         放行全部爬虫 + 声明 sitemap
sitemap.xml        单页站点，只有一个 URL（见「SEO」一节）
scripts/fetch-logos.sh  批量抓品牌图标
scripts/gen-hero-bg.py  重新生成 hero 底图
scripts/make-brand-lockup.py  从用户给的 logo 截图生成页头品牌图（浅/暗两版）
.nojekyll           关掉 GitHub Pages 的 Jekyll 处理，直接发静态文件
```

## 加一个条目

往 `data/entries.js` 的 `entries` 数组里追加一段：

```js
{
  name: 'Protect AI',                 // 必填
  url: 'https://protectai.com',       // 必填
  section: 'companies',               // 必填，指向 sections 里的 key
  desc: '一句话说明它做什么',           // 中文描述
  desc_en: 'One-line English.',       // 可选，缺省回落中文
  tags: ['模型安全', 'LLM 防护'],       // 可选，横切标签
  star: 1522,                         // 可选，有则显示 ★
  region: 'US',                       // 可选：US / CN / IL / CH / EU
  logo: 'assets/logos/lakera-ai.png',  // 可选，品牌图标；缺省用首字母字标
  post: 'https://…',                  // 可选，深度长文链接
  status: 'featured',                 // 可选，featured 会置顶并打「推荐」标
  added: '2026-10-21'                 // 可选，YYYY-MM-DD，用于「最近更新」排序
}
```

除 name / url / section 外全部可选，没填的字段不会渲染出空占位。

## 加一个板块

往 `sections` 里追加一段（`key` 唯一，条目用 `section` 指向它），页面会自动多出一个 tab、一个分区和一套板块色：

```js
{ key: 'conferences', zh: '会议与赛事', en: 'Events', color: '#3A86FF',
  desc: '中文一句话定位', desc_en: 'One-line English.' }
```

模板不认识任何具体分类，所以加板块不用改 HTML/CSS/JS：左侧分类栏、板块分区、板块色、标签池全部由数据推导。

## 品牌图标

图标一律存成本地文件放 `assets/logos/`，站点运行时不请求任何第三方图标服务——
Google 的 favicon 服务在部分网络里根本不通，而 favicon.im 抓不到时会回一张通用 "f" 占位图，
三家不同公司顶上出现同一个假 logo，比首字母更糟。

```bash
# 清单每行「来源|文件名」：域名抓 favicon，org:X 抓 GitHub 组织头像
printf 'lakera.ai|lakera-ai\norg:NVIDIA|org-nvidia\n' > /tmp/logo-sources.txt
bash scripts/fetch-logos.sh
```

抓完把打印出来的路径填进条目的 `logo` 字段。抓不到的就不填，卡片自动退回首字母字标。

## 换站点自身的标

`assets/logo.jpg` 是唯一原图，页头标 / favicon / 桌面图标 / OG 卡片四张都由它派生，改标只需覆盖它再重跑：

```bash
sips -s format png -z 96 96   assets/logo.jpg --out assets/logo.png            # 页头
sips -s format png -z 32 32   assets/logo.jpg --out assets/logo-32.png         # favicon
sips -s format png -z 180 180 assets/logo.jpg --out assets/apple-touch-icon.png
# OG：先缩到 360 再补白到 1200x630，圆标居中留边；直接 padToHeightWidth 会被撑满高度
sips -s format png -z 360 360 assets/logo.jpg --out /tmp/og-src.png
sips -s format png --padToHeightWidth 630 1200 --padColor FFFFFF \
    /tmp/og-src.png --out assets/og.png                                        # 分享卡片
```

页头和 favicon 靠 `border-radius: 50%` 把方图裁成内切圆：原图是白底、没有透明通道，
直接方着贴在暗色主题上会露出四个白角。OG 图必须是有尺寸的位图，SVG 卡片 Twitter / Slack / 微信都不认。

OG 上没写字，只放了标：试过用 `qlmanage` 把带文案的 SVG 光栅化成 1200×630，
它输出的是 1200×1200 缩略图、缩放和留边都不受控（量下来圆心会跑偏），所以退回纯补白。
改完记得核对一下几何：`sips -g pixelWidth -g pixelHeight assets/og.png` 应该是 1200×630。

## 版式

顶部 hero 是一整块深色面板：`assets/hero-bg.jpg` 垫底，上面再压一条斜向压暗渐变
（左浓右淡，白字自己保证对比度），右侧叠内联 SVG 雷达。面板**不跟随** `data-theme`
—— 图上压白字，跟着主题翻浅色会让字掉进亮背景里，所以两种模式下 hero 都是深的。
面板里依次是双语标题、双语副标题、两个 CTA、收录范围图例条。
图例条是 12 个「图标 + 名称」的胶囊（企业 / 开源项目 / 深度文章 / 模型评测数据集 /
论文 / 教授 / 知名博主 / 微信公众号 / 知乎 / bilibili / 微博 / YouTube），
**写成静态 HTML 而不是 JS 渲染** —— 爬虫不执行 JS，SEO 那轮已经因为这个吃过亏
（见下面「已知短板」）。图标统一一个青色，不搞十二种颜色：深色面板上彩虹一排很吵。
这里原来是一面灰度品牌 logo 墙，`renderWall()` 已从 app.js 删除。

左侧固定一列分类栏（板块 + 提交入口 + 展示位），右侧是详情卡片网格。
**每个分类菜单是一个独立色块**：底色是板块色的淡染色 + 左侧一道实色边条 + 板块色计数胶囊，
选中时整块填成掺黑的板块色、字翻白（四个板块色亮度差得多，纯色配白字过不了 AA，
所以统一掺 48% 黑，最低 5.8:1）。改 `sections` 里的 `color` 即可换色，不用碰 CSS。
窄屏（<=980px）侧栏退化成顶部横向滚动的胶囊条，色块逻辑不变。
标签不在侧栏占位置：点卡片上的标签即可筛选，筛选条件会出现在面包屑里，那里有一个「×」可以取消。

## hero 底图

底图不是现成素材，是 `scripts/gen-hero-bg.py` 跑出来的：深海军蓝斜向渐变 + 两团品牌色辉光 +
透视网格 + 节点关系图 + 斜向扫描光带 + 四周压角。左右明暗分布是刻意做的 ——
左侧预压暗给白字，右侧留亮给雷达和辉光，和 CSS 里那条压暗渐变配套，换图就得重调 CSS。

```bash
python3 scripts/gen-hero-bg.py            # 覆盖写 assets/hero-bg.jpg
python3 scripts/gen-hero-bg.py --seed 7 --w 1600 --h 900 --out /tmp/bg.jpg
```

依赖 numpy / pillow，只在本机跑，站点本身零依赖。

## 页头品牌图

用户给的 logo 截图（深海军蓝底上一条白带，蓝字「AISec123」+ 副标压在带内）
不能直接拿去用：图里绝大部分是背景，而且字是**贴纸风** —— 蓝芯外面还裹着
一圈 2–4px 的白描边，描边占了视觉重量，只抠蓝芯字会细一圈。

`scripts/make-brand-lockup.py` 做六件事：

1. **白带当 ROI** —— `gray>185` 的最大连通域就是那条白带，外扩 10px。
   字全在带内；带外是海军蓝纹理底，还有右下角一团手绘涂鸦，也是蓝的，
   先用 ROI 把活动范围框住。
2. **双门限取蓝像素** —— `sat>0.30` 且 `60<gray<205`。白带（灰 232）和
   深海（灰 48）同时出局。下限取 60 是专门为了放过「Sec」：那三个字母是更深的蓝，
   灰只有 86，早先按 90 切直接把它们切没了，logo 变成「AISec123」缺三个字母。
3. **只留坐在白纸上的连通域** —— 白带自己沿口也有一圈深蓝描边，带外还有涂鸦，
   颜色上和字母分不掉。但它们**被深蓝底包围**，字母**被白带包围**。所以看每个
   连通域外扩 4px 后邻域里的白带占比：字母 0.65–0.99，描边碎片和涂鸦 0.02–0.28，
   按 0.45 一刀切开。
4. **把白描边按距离圈进 alpha** —— 描边和白带是连着的同一种白，没法按颜色分，
   只能按距离：逐圈膨胀，第 k 圈 alpha = 1 - k/(R+1)，R=5。反解颜色
   `C = (p - 232*(1-a)) / a` 后，描边像素仍是白色 —— 于是浅色页头上白描边
   融进白侧栏只剩蓝字，暗色页头上描边成一圈柔光把字托住。
5. 按 alpha 裁到内容边界（**不能**用 RGBA 的 `getbbox()`，反解出的 RGB 在全图
   非零，bbox 会退化成整图），留 3px 呼吸。
6. 缩到 2x 显示尺寸（CSS 显示 115x38，出图 231x76），LANCZOS 重采样。
   452x188 的源图出来 39KB。

```bash
python3 scripts/make-brand-lockup.py [源图路径]     # 默认 ~/Desktop/截屏2026-10-22 19.38.14.png
```

**两个主题都不垫底板，靠换图解决对比度**：原图「Sec」和副标是深蓝，
RGB(27,72,147) 压 `#12181b` 只有 2.1:1，会糊。所以暗色主题换 `brand-lockup-glow.png`
—— `glow_variant()` 在线性光空间把暗部亮度抬到 0.19（同乘一个系数，色相不变），
提到 4.2:1。「AI」的亮蓝本来就有 4.7:1，「123」的青 5.6:1，都不动。
两个 `<img>` 靠 CSS 按 `[data-theme]` 切换，所以 logo 是「长」在页头上的，
看不到图片边界。

logo 里已经带了副标，所以 HTML 不再单独写一行 `brand-sub` —— 写了就跟图里重复。

## 展示位

`data/entries.js` 顶层的 `sponsors` 渲染在侧栏底部，每张带角标（自家 / 广告 / 虚位招租）。
展示位和收录是两套数据：`sponsors` 不进 `entries`，不参与搜索、排序和计数，
所以付钱买不到列表里的位置。页脚的 `friends` 同理，只是互链。

## SEO

站点是单页应用，分类 / 搜索 / 排序全是前端状态，所以 SEO 资产都很薄但齐全：

| 文件 | 作用 |
|---|---|
| `robots.txt` | 放行全部 + 声明 sitemap 地址 |
| `sitemap.xml` | 只有一个 URL（`?sec=` / `?q=` 是同一页的不同视图，属重复内容，不进） |
| `index.html` `<head>` | canonical、og / twitter 卡片、theme-color |
| `index.html` JSON-LD | `WebSite` + `Organization` 结构化数据 |

两处关键词布局，分工不同：

- **`<title>` 标签** —— 主标题后面用 `｜` 接上全部别名：
  `AISec123 · 全网最全 AI 安全知识图谱｜AI 攻防数据库 · AI 威胁矩阵 · AI 安全知识库`。
  title 是搜索引擎给页面定主题的第一权重，别名必须出现在这里，而不是藏在
  页脚或 meta keywords（那东西 2009 年后就没人看了）。og:title / twitter:title
  跟 `<title>` 保持一致。超长部分在搜索结果里会被截断，但索引用的是完整字符串。
- **`alternateName`（JSON-LD）** —— 同一批别名的结构化声明，带/不带空格各写
  了一份，因为中文分词两种都可能被搜。

`potentialAction` 里的 `SearchAction` 指向 `/?q={关键词}`（就是 `app.js` 的
`readUrl` 读的那个参数），够条件时 Google 会在搜索结果里给站点加一个站内搜索框。

**改 `data/entries.js` 的 `updated` 时，把 `sitemap.xml` 的 `<lastmod>` 同步成同一天。**

### 已知短板：内容是 JS 渲染的

54 个条目的卡片由 `app.js` 从 `data/entries.js` 渲染。Googlebot / Bingbot 会执行
JS，看得见；但**大多数 AI 爬虫（GPTBot、ClaudeBot 等）不执行 JS**，它们只拿到
`<head>` 和 hero/页脚的静态文本。想让 AI 答案引擎引用到具体条目，需要把条目
做成初始 HTML（`<noscript>` 全量列表，或构建时预渲染进 index.html）——
这是个要加生成步骤的改动，还没做。

## 本地预览

```bash
python3 -m http.server 4100     # 或直接双击 index.html，数据是 <script> 不是 fetch，file:// 也能跑
```

## 发布

```bash
git add -A && git commit -m 'add: xxx' && git push origin main
```

push 完 GitHub Pages 直接生效，没有构建步骤。

## 收录口径

人工核对过再收：不看 star 数、不看融资额、不收钱。开源条目要求能自己跑起来，公司条目要求有实际产品而不是只有一个 landing page。
展示位单独标注，和收录两套数据，付钱也进不了列表。

错漏请 [提 issue](https://github.com/AISec123/aisec123.github.io/issues/new)。

---

姊妹站：[Scanners-Box 每日 AI 工具推荐](https://we5ter.github.io/ai-tools/) · [Wester's Space](https://we5ter.github.io/)
