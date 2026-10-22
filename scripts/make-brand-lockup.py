#!/usr/bin/env python3
"""把用户给的手绘 logo 转成品牌锁定图。

源图是一张「白纸 + brush 笔触」的 PNG：四角和边缘是透明的，但**中间整块
是不透明白底**（62.7% 的像素 alpha=255）。直接拿去用，浅色主题下白底看不出来，
暗色主题下会赫然出现一块白矩形，而四角又是透明的 —— 像个渲染 bug。

所以这里做三件事：
  1. 去白底：把每个像素当成「笔触色与白色的混合」反解出来。白底 95344 px 里
     只有 1960 px 挨着深色像素（全是笔画边缘的抗锯齿过渡），可以安全抠。
  2. 裁到内容边界，留 4px 呼吸。
  3. 缩到 2x 显示尺寸（显示 38px 高 → 出 76px），LANCZOS 重采样。

用法：
    python3 scripts/make-brand-lockup.py [源图路径]

产物：assets/brand-lockup.png
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/aisec123_logo.png")
OUT = os.path.join(ROOT, "assets", "brand-lockup.png")

DISPLAY_H = 38          # CSS 里 .brand-lockup 的高度
SCALE = 2               # 2x 素材，hidpi 不糊


def unblend_from_white(im):
    """p = C*a + 255*(1-a)  →  反解出笔触色 C 和它的不透明度 a。

    对纯白像素 a=0（变透明），对纯笔触色 a=1（原色），对边缘过渡像素给出
    中间的 a 和还原后的 C —— 抗锯齿因此被完整保留，不会出现白边或彩边。
    """
    a = np.array(im).astype(np.float32)
    rgb, alpha = a[:, :, :3], a[:, :, 3]

    # 原图已经透明的角落是 (0,0,0,0)，min=0 会反解出 a=1，必须用原 alpha 兜住
    lum = rgb.min(axis=2)
    new_alpha = np.clip(255.0 - lum, 0, 255) * (alpha / 255.0)

    # C = (p - 255*(1-a)) / a，a 是 0..1 的比例。
    # 注意别把分母写成 new_alpha（0..255）—— 那样算出的是 C/255，
    # 再 round 就全变成 0 或 1，整张图发黑。第一版就栽在这。
    frac = np.clip(new_alpha / 255.0, 1e-4, 1.0)
    recovered = (rgb - 255.0 * (1.0 - frac)[:, :, None]) / frac[:, :, None]
    recovered = np.clip(np.round(recovered), 0, 255).astype(np.uint8)

    out = np.dstack([recovered, np.round(new_alpha).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def main():
    im = Image.open(SRC).convert("RGBA")
    print("源图: %s  %s" % (SRC, im.size))

    cut = unblend_from_white(im)

    # 裁到内容边界（去白之后 halo 也算内容，但它本来就在笔画外沿，留着更自然）
    bbox = cut.getbbox()
    if not bbox:
        sys.exit("抠完什么都没有，检查源图")
    print("内容边界: %s" % (bbox,))

    pad = 4
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(cut.width, r + pad); b = min(cut.height, b + pad)
    cut = cut.crop((l, t, r, b))
    print("裁切后: %s（含 %dpx 呼吸边）" % (cut.size, pad))

    target_h = DISPLAY_H * SCALE
    target_w = round(cut.width * target_h / cut.height)
    cut = cut.resize((target_w, target_h), Image.LANCZOS)
    print("输出尺寸: %s（显示 %dx%d，%dx 素材）" % (cut.size, target_w // SCALE, DISPLAY_H, SCALE))

    cut.save(OUT, optimize=True)
    print("写入: %s  %.1f KB" % (OUT, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
