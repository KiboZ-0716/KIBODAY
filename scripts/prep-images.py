"""素材入库预处理：裁掉右下角 AI 水印、统一为长边 1600 的 JPG，落到 content/images/。
只跑一次；之后由 pipeline/stages/assets.mjs 负责转 WebP 多尺寸。"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "public" / "images" / "raw"
OUT = ROOT / "content" / "images"
OUT.mkdir(parents=True, exist_ok=True)

JOBS = {
    "transit": ("raw-train.jpg", False),
    "climate": ("raw-earth.jpg", False),
    "energy": ("Editorial_documentary_photogra_2026-10-30T02-35-04.png", True),
    "city": ("Editorial_documentary_photogra_2026-10-30T02-35-23.png", True),
    "port": ("Editorial_documentary_photogra_2026-10-30T02-35-42.png", True),
}

for slug, (name, crop_mark) in JOBS.items():
    im = Image.open(RAW / name).convert("RGB")
    if crop_mark:
        w, h = im.size
        im = im.crop((0, 0, w - int(w * 0.13), h - int(h * 0.09)))
    long_edge = max(im.size)
    if long_edge > 1600:
        ratio = 1600 / long_edge
        im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.LANCZOS)
    out = OUT / f"{slug}.jpg"
    im.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"{out.name:14s} {im.size[0]}x{im.size[1]}  {out.stat().st_size // 1024} KB")
