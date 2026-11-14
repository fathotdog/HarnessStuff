"""把 2×2 四塊 zoom 截圖拼成一張，裁掉頂端欄標題殘線與右側空白，四周留白。

用法：
    uv run --no-project --with pillow python -I stitch.py --tiles TL TR BL BR --out OUT.png
        [--blank x0,y0,x1,y1 ...] [--pad 24]

--blank 以「拼好、裁切前」的座標塗白矩形（用來蓋掉協作者游標框）；先不加跑一次，
腳本會印出畫布大小，再量座標。右緣以快照標題列的藍色 #6D9EEB 最右端為準。
"""

import argparse

from PIL import Image, ImageDraw

HEADER_BLUE = (109, 158, 235)  # #6D9EEB


def near(p, ref, tol=18):
    return all(abs(a - b) <= tol for a, b in zip(p, ref, strict=False))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiles", nargs=4, required=True, metavar=("TL", "TR", "BL", "BR"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--blank", action="append", default=[])
    ap.add_argument("--pad", type=int, default=24)
    a = ap.parse_args()

    tl, tr, bl, br = (Image.open(p).convert("RGB") for p in a.tiles)
    print("tiles", tl.size, tr.size, bl.size, br.size)
    w, h = tl.width + tr.width, tl.height + bl.height
    c = Image.new("RGB", (w, h), "white")
    c.paste(tl, (0, 0))
    c.paste(tr, (tl.width, 0))
    c.paste(bl, (0, tl.height))
    c.paste(br, (bl.width, tl.height))
    print("canvas", c.size)

    draw = ImageDraw.Draw(c)
    for box in a.blank:
        draw.rectangle([int(v) for v in box.split(",")], fill="white")

    px = c.load()
    # 頂端：前 20 列裡最後一條橫跨八成寬度的線以上都裁掉
    top = 0
    for y in range(min(20, h)):
        if sum(1 for x in range(w) if sum(px[x, y]) < 720) > 0.8 * w:
            top = y + 1
    # 右緣：標題列藍色的最右端
    right = w
    for x in range(w - 1, -1, -1):
        if any(near(px[x, y], HEADER_BLUE) for y in range(0, h, 4)):
            right = x + 2
            break
    print("crop top", top, "right", right)
    c = c.crop((0, top, min(right, w), h))

    out = Image.new("RGB", (c.width + 2 * a.pad, c.height + 2 * a.pad), "white")
    out.paste(c, (a.pad, a.pad))
    out.save(a.out, optimize=True)
    print("saved", a.out, out.size)


if __name__ == "__main__":
    main()
