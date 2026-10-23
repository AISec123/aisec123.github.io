#!/usr/bin/env python3
"""从用户给的 logo 截图提取品牌锁定图（透明底）。

第三版源图（截屏2026-10-22 19.38.14.png）结构：
  - 上下是深海军蓝纹理底（灰 ≈ 48，sat ≈ 0.70），带外还有手绘涂鸦
  - 中间一条近白横带（灰 ≈ 232，sat ≈ 0.03），带沿有一圈自己的深蓝描边
  - 蓝字「AISec123」+ 副标压在带内。「A/I」和「123」灰 132–138，
    「Sec」和副标是更深的蓝、灰只有 86

蓝字是**贴纸风**：蓝芯外面还裹着一圈 2–4px 的白描边，描边占了视觉重量。
只抠蓝芯，字会细一圈、在 115×38 的真实显示尺寸下尤其明显。

抠法：
  1. 白带（gray>185 的最大连通域）当 ROI，外扩 10px
  2. 双门限取蓝像素（sat>0.30 且 60<gray<205）—— 白带出局、深海出局，
     60 这个下限是专门为了放过「Sec」的深蓝
  3. keep_on_paper：白带自己的描边和带外涂鸦也是蓝的，颜色分不掉，
     但它们**被深蓝底包围**，字母**被白带包围**。看每个连通域外扩 4px
     后邻域里的白带占比：字母 0.65–0.99，描边/涂鸦 0.02–0.28，取 0.45 切
  4. soft_halo 逐圈膨胀，把**紧贴蓝字的白描边**按距离分级圈进 alpha
     （白描边和白带是连着的同一种白，只能按距离分：近的是描边，远的是带）
  5. 反解颜色：p = C*a + 带色*(1-a) → C = (p - 232*(1-a))/a。
     描边像素反解出来仍是白色，于是：
       浅色页头 → 白描边融进白底，只剩蓝字（看不到图片边界）
       暗色页头 → 白描边成一圈柔光，衬出贴纸感
  6. 按 alpha 裁到内容边界，缩到 2× 显示尺寸出图

产出两个变体：
  brand-lockup.png       原色（浅色主题，直接放白侧栏上）
  brand-lockup-glow.png  提亮版（暗色主题，「Sec」的深蓝抬到 3.7:1 以上）

用法：
    python3 scripts/make-brand-lockup.py [源图路径]
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    "~/Desktop/截屏2026-10-22 19.38.14.png")
OUT = os.path.join(ROOT, "assets", "brand-lockup.png")
OUT_GLOW = os.path.join(ROOT, "assets", "brand-lockup-glow.png")

BAND_GRAY = 232.0     # 白带亮度（反解颜色时当底色）
DISPLAY_H = 38        # CSS 里 .brand-lockup 的高度
SCALE = 2
HALO_R = 5            # 白描边圈入半径（源图像素）；103/452≈0.23 的显示缩放下
                      # 5px → 显示约 1.6px 柔边，出图 2× 后约 3px，够看出贴纸感
                      # 又不至于在浅色主题下糊成一团白
ROI_PAD = 10          # 白带 ROI 外扩：字母完整在带内，外扩只是留点余量；
                      # 再大就会把右下角的手绘涂鸦放进来
PAPER_FRAC = 0.45     # 「邻域白带占比」阈值：字母 ≥0.65，描边/涂鸦 ≤0.28


def largest_cc(mask):
    """保留最大连通域，其余清零。返回新 mask。"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best, best_size = None, 0
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack, comp = [(y, x)], []
            seen[y, x] = True
            while stack:
                cy, cx = stack.pop()
                comp.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(comp) > best_size:
                best, best_size = comp, len(comp)
    out = np.zeros_like(mask)
    if best:
        for y, x in best:
            out[y, x] = True
    return out


def dilate(mask, r):
    for _ in range(r):
        p = np.pad(mask, 1)
        mask = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] |
                p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:])
    return mask


def drop_small(alpha, min_area=24):
    """alpha>0.5 的二值图里去掉小块（纹理噪点），再返回软化后的 alpha。"""
    binary = alpha > 0.5
    binary = largest_cc_limited(binary, min_area)
    # 重新软化：二值边缘高斯模糊一圈，恢复抗锯齿
    soft = np.array(Image.fromarray((binary * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(0.9)))
    return np.maximum(soft / 255.0, alpha * binary)


def largest_cc_limited(mask, min_area):
    """去掉面积 < min_area 的连通域，保留所有大连通域（字是一个个字符，都是独立块）。"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = np.zeros_like(mask)
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack, comp = [(y, x)], []
            seen[y, x] = True
            while stack:
                cy, cx = stack.pop()
                comp.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(comp) >= min_area:
                for py, px in comp:
                    out[py, px] = True
    return out


def soft_halo(core, radius):
    """字芯外围一圈逐级淡出的软边（贴纸的白描边）。

    原图是贴纸风：蓝字芯 + 2–4px 白描边，描边占了视觉重量，只抠蓝芯字会细一圈。
    但白描边和背景白带是连在一起的白，没法按颜色分 —— 只能用**距离**分：
    离蓝字近的白是描边，远的是带。

    逐次膨胀近似距离变换：第 k 圈 alpha = 1 - k/(radius+1)，外圈自然淡出。
    """
    alpha = np.zeros(core.shape, dtype=np.float32)
    counted = np.zeros_like(core)
    cur = core.copy()
    alpha[cur] = 1.0
    counted[cur] = True
    for k in range(1, radius + 1):
        cur = dilate(cur, 1)
        ring = cur & ~counted
        alpha[ring] = 1.0 - k / float(radius + 1)
        counted |= ring
    return alpha


def keep_on_paper(mask, paper, min_area=24, min_frac=0.45, probe=4):
    """只保留**坐在白纸上**的连通域。

    白带是手绘的，带沿有一圈自己的深蓝描边；带外海军蓝底上还有涂鸦。
    这两样都是蓝的，光靠颜色分不掉 —— 但它们**被深蓝底包围**，
    而字母**被白带包围**。所以看每个连通域外扩 probe px 后的邻域里
    白带占比：字母 0.65–0.99，描边碎片和涂鸦 0.02–0.28，中间是空档。
    """
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = np.zeros_like(mask)
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            stack, comp = [(y, x)], []
            seen[y, x] = True
            while stack:
                cy, cx = stack.pop()
                comp.append((cy, cx))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(comp) < min_area:
                continue
            cm = np.zeros_like(mask)
            for py, px in comp:
                cm[py, px] = True
            around = dilate(cm, probe) & ~cm
            if around.sum() == 0:
                continue
            frac = (around & paper).sum() / around.sum()
            if frac >= min_frac:
                for py, px in comp:
                    out[py, px] = True
    return out


def extract(im):
    a = np.array(im).astype(np.float32)
    rgb = a[:, :, :3]
    gray = rgb.mean(axis=2)

    # ── ROI：中部那条白带 ────────────────────────────────────
    #   字全压在带内；带外是海军蓝纹理底 + 右下角一团手绘涂鸦，
    #   涂鸦也是蓝的，会被下面的门限一起抓到，必须先用白带把它挡掉。
    band = largest_cc(gray > 185)
    roi = dilate(band, ROI_PAD)
    print("白带 %d 像素，ROI 外扩 %dpx" % (band.sum(), ROI_PAD))

    # ── 蓝字芯：既饱和又中等亮度 ──────────────────────────────
    #   「A/I」和「123」gray≈132–138，「Sec」是更深的蓝 gray≈86，
    #   海军蓝底 gray≈48、白带 gray≈232。门限取 60：放过 Sec，挡掉深海。
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    blue = (sat > 0.30) & (gray > 60) & (gray < 205) & roi
    print("ROI 内蓝像素: %d" % blue.sum())

    # 只留**坐在白纸上**的（挡掉白带自己的手绘描边和带外涂鸦）
    core_bin = keep_on_paper(blue, band, min_frac=PAPER_FRAC)
    print("纸上的字芯: %d" % core_bin.sum())

    # 恢复抗锯齿软边
    core = drop_small(core_bin.astype(np.float32))

    # ── 白描边：紧邻蓝字的白 ──────────────────────────────────
    halo = soft_halo(core > 0.5, HALO_R)
    whitish = np.clip((gray - 150.0) / 30.0, 0, 1)   # 只往亮的地方扩，不啃深海
    alpha = np.maximum(core, halo * whitish * roi)
    print("有效 alpha 像素: %d（占比 %.1f%%）" % ((alpha > 0.05).sum(), (alpha > 0.05).mean() * 100))

    # ── 反解颜色：边缘是「字色/白 + 白带」的混合，按 alpha 还原纯色 ──
    safe = np.maximum(alpha, 1e-4)[:, :, None]
    recovered = np.clip((rgb - BAND_GRAY * (1.0 - alpha[:, :, None])) / safe, 0, 255)
    out = np.dstack([np.round(recovered), np.round(alpha * 255)]).astype(np.uint8)
    # alpha=0 处颜色清零，否则 RGBA 的 getbbox / 后续处理会按整图算
    out[out[:, :, 3] == 0] = 0
    return Image.fromarray(out, "RGBA")


def glow_variant(im, target=0.19, k_max=3.0):
    """暗色主题版：给压不住深底的暗蓝一个亮度下限。

    「Sec」和副标题是深蓝 RGB(32,72,144)，相对亮度只有 0.070，
    压 #12181b 页头仅 2.0:1，会糊。按**线性光**空间把暗部的亮度
    抬到 target：线性 RGB 同乘一个系数，色相不变，只是变亮。

    「AI」的亮蓝（0.224 → 4.7:1）和「123」的青（0.268 → 3.3:1）
    本来就读得清，不动。白描边 alpha 低，也不动。
    """
    a = np.array(im).astype(np.float32)
    rgb, alpha = a[:, :, :3], a[:, :, 3] / 255.0
    lin = (rgb / 255.0) ** 2.2
    lum = 0.2126 * lin[:, :, 0] + 0.7152 * lin[:, :, 1] + 0.0722 * lin[:, :, 2]
    dark = (lum < target) & (alpha > 0.5)
    k = np.clip(target / np.maximum(lum, 1e-4), 1.0, k_max)
    lin = lin * np.where(dark, k, 1.0)[:, :, None]
    rgb = np.clip((np.clip(lin, 0, 1) ** (1.0 / 2.2)) * 255.0, 0, 255)
    out = np.dstack([np.round(rgb), np.round(alpha * 255)]).astype(np.uint8)
    out[out[:, :, 3] == 0] = 0
    print("提亮像素: %d" % dark.sum())
    return Image.fromarray(out, "RGBA")


def content_bbox(im, thresh=8):
    """按 alpha 取内容边界（RGBA 的 getbbox 会把全图算进来，不能直接用）。"""
    alpha = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(alpha > thresh)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def finish(im, path, label):
    bbox = content_bbox(im)
    if not bbox:
        sys.exit("抠完什么都没有，检查源图")
    l, t, r, b = bbox
    pad = 3
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(im.width, r + pad); b = min(im.height, b + pad)
    im = im.crop((l, t, r, b))
    th = DISPLAY_H * SCALE
    tw = round(im.width * th / im.height)
    im = im.resize((tw, th), Image.LANCZOS)
    im.save(path, optimize=True)
    print("%s: 裁 %dx%d → 显示 %dx%d / 出图 %dx%d，%.1f KB" % (
        label, r - l, b - t, tw // SCALE, DISPLAY_H, tw, th, os.path.getsize(path) / 1024))


def main():
    im = Image.open(SRC).convert("RGB")
    print("源图: %s  %s" % (SRC, im.size))

    art = extract(im)
    finish(art, OUT, "原色（浅色主题）")
    finish(glow_variant(art), OUT_GLOW, "提亮（暗色主题）")


if __name__ == "__main__":
    main()
