#!/usr/bin/env python3
"""生成 hero 背景图 assets/hero-bg.jpg。

为什么是脚本而不是现成的图：
  1) 站点是零构建的纯静态仓库，能少一个"来路不明"的二进制就少一个；
  2) 背景是给白字垫底的，明暗分布必须可控 —— 出图后要能和 style.css 里
     那条压暗渐变对得上，脚本改参数重跑就行，不用再去开设计软件。

画面构成（从底到面）：
  深海军蓝斜向渐变 → 两团品牌色辉光 → 透视网格 → 节点关系图（连线的
  "攻击面"隐喻）→ 斜向扫描光带 → 四周压角。

用法：
  python3 scripts/gen-hero-bg.py            # 写 assets/hero-bg.jpg
  python3 scripts/gen-hero-bg.py --out x.jpg --w 1600 --h 900

依赖：numpy、pillow（只在本机跑，站点本身不需要）。
"""

import argparse
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 与 style.css 的 --accent(#2f7d95) / 板块色 #F72585 同源，
# 改主题色时这两处一起改，背景才不会脱离品牌。
TEAL = (47, 125, 149)
MAGENTA = (247, 37, 133)


def linear_gradient(w, h, top_left, bottom_right):
    """斜向双线性渐变，左上 → 右下。"""
    ys = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    xs = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :]
    t = (xs * 0.55 + ys * 0.45)  # 斜向权重：横向占比略高，免得看起来像纯竖向
    t = t[..., None]
    a = np.array(top_left, dtype=np.float32)
    b = np.array(bottom_right, dtype=np.float32)
    return a * (1.0 - t) + b * t


def radial_glow(w, h, cx, cy, radius, color, strength):
    """一团高斯辉光。radius 是 1/e 半径（像素）。"""
    ys = np.arange(h, dtype=np.float32)[:, None]
    xs = np.arange(w, dtype=np.float32)[None, :]
    d2 = ((xs - cx) ** 2 + (ys - cy) ** 2) / (radius ** 2)
    g = np.exp(-d2).astype(np.float32)[..., None]
    return g * np.array(color, dtype=np.float32) * strength


def vignette(w, h, power=1.35, inner=0.42):
    """四周压角：中间 1.0，边缘衰减到 0。"""
    ys = (np.arange(h, dtype=np.float32)[:, None] / h) * 2.0 - 1.0
    xs = (np.arange(w, dtype=np.float32)[None, :] / w) * 2.0 - 1.0
    r = np.sqrt(xs ** 2 + ys ** 2) / np.sqrt(2.0)
    v = np.clip(1.0 - ((r - inner) / (1.0 - inner)), 0.0, 1.0) ** power
    return v[..., None].astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='assets/hero-bg.jpg')
    ap.add_argument('--w', type=int, default=1920)
    ap.add_argument('--h', type=int, default=1080)
    ap.add_argument('--seed', type=int, default=20261021)
    args = ap.parse_args()

    W, H = args.w, args.h
    rng = random.Random(args.seed)

    # 1) 底色：左上最深，右下留一点亮度给右侧的雷达图和辉光
    img = linear_gradient(W, H, (5, 12, 19), (11, 30, 42))

    # 2) 两团辉光：青色压右上方（跟 hero-art 的雷达同侧），洋红点在左下做冷暖对比
    img += radial_glow(W, H, W * 0.86, H * 0.22, W * 0.30, TEAL, 0.55)
    img += radial_glow(W, H, W * 0.10, H * 0.92, W * 0.26, MAGENTA, 0.28)
    img += radial_glow(W, H, W * 0.52, H * 0.55, W * 0.42, TEAL, 0.12)

    base = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')

    # 3) 网格：先画一份到 overlay 上再高斯模糊，硬线条会显得廉价
    grid = Image.new('RGB', (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(grid)
    step = 54
    for x in range(0, W + step, step):
        gd.line([(x, 0), (x, H)], fill=(28, 62, 78), width=1)
    for y in range(0, H + step, step):
        gd.line([(0, y), (W, y)], fill=(28, 62, 78), width=1)
    # 每 5 格加粗一条，读起来像"坐标系"而不是壁纸
    for x in range(0, W + step, step * 5):
        gd.line([(x, 0), (x, H)], fill=(44, 96, 118), width=2)
    for y in range(0, H + step, step * 5):
        gd.line([(0, y), (W, y)], fill=(44, 96, 118), width=2)
    grid = grid.filter(ImageFilter.GaussianBlur(1.1))
    # 网格是"加光"不是"贴纸"：直接按像素相加，越亮的地方网格越明显
    base = Image.fromarray(
        np.clip(np.asarray(base, dtype=np.float32) + np.asarray(grid, dtype=np.float32) * 0.55, 0, 255).astype(np.uint8),
        'RGB')

    # 4) 节点关系图：随机撒点，近邻连线。密度偏右上，左边留给文字。
    nodes = []
    tries = 0
    while len(nodes) < 74 and tries < 4000:
        tries += 1
        # x 用平方分布把点往右推 —— 左侧 35% 基本留空，白字才干净
        x = rng.random() ** 0.55
        x = 0.30 + x * 0.72
        if x > 1.0:
            continue
        y = rng.random()
        nodes.append((x * W, y * H))
    net = Image.new('RGB', (W, H), (0, 0, 0))
    nd = ImageDraw.Draw(net)
    LINK = 190
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            x1, y1 = nodes[i]
            x2, y2 = nodes[j]
            if (x1 - x2) ** 2 + (y1 - y2) ** 2 > LINK ** 2:
                continue
            nd.line([(x1, y1), (x2, y2)], fill=(58, 122, 146), width=1)
    for (x, y) in nodes:
        r = rng.choice([2, 2, 3, 3, 4])
        nd.ellipse([x - r, y - r, x + r, y + r], fill=(126, 205, 228))
    net = net.filter(ImageFilter.GaussianBlur(0.8))
    arr = np.asarray(base, dtype=np.float32) + np.asarray(net, dtype=np.float32) * 0.5
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')

    # 5) 斜向扫描光带：两道很淡的高光，给静态图一点方向感
    streak = Image.new('RGB', (W, H), (0, 0, 0))
    sd = ImageDraw.Draw(streak)
    for off, wdt, op in ((int(W * 0.18), 90, 26), (int(W * 0.62), 46, 18)):
        sd.polygon(
            [(off, 0), (off + wdt, 0), (off + wdt + int(H * 0.55), H), (off + int(H * 0.55), H)],
            fill=(op, op * 2, op * 2 + 8))
    streak = streak.filter(ImageFilter.GaussianBlur(28))
    arr = np.asarray(base, dtype=np.float32) + np.asarray(streak, dtype=np.float32)
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')

    # 6) 压角 + 左侧额外压暗（文字区），出图后 CSS 还要再压一层，这里只做预压
    arr = np.asarray(base, dtype=np.float32)
    arr *= vignette(W, H)
    left = np.clip((np.arange(W, dtype=np.float32)[None, :] / (W * 0.55)), 0.0, 1.0)
    arr *= (0.55 + 0.45 * left)[..., None]
    base = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')

    base.save(args.out, 'JPEG', quality=82, optimize=True, progressive=True)
    print('wrote', args.out, base.size)


if __name__ == '__main__':
    main()
