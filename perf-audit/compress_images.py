"""
图片压缩脚本 —— 为 ybovo.com 首屏瘦身

背景：next.config.mjs 设置了 images.unoptimized=true，next/image 不做任何优化，
      原图直出。首屏图片占 83% 体积，其中 ios26.png 单文件 940KB。

策略：首屏大图转 WebP（保留 alpha 通道），头像按实际显示尺寸缩放，非首屏图片一并处理。

用法：python compress_images.py [--apply]
      不带 --apply 时只做试算，不写文件。
"""

import os
import sys
import io
from PIL import Image

# Windows 控制台默认 GBK，强制 UTF-8 以正常显示中文
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

# Pillow 的格式标识与扩展名不同：jpg → JPEG
PIL_FORMAT = {"webp": "WEBP", "jpg": "JPEG", "jpeg": "JPEG", "png": "PNG"}

PUBLIC = r"C:\Users\yibai\Documents\vibecoding\task\0913-homepage\public"
APPLY = "--apply" in sys.argv

# (相对路径, 目标格式, 质量, 最大宽度或 None)
JOBS = [
    ("ios26.png", "webp", 82, None),      # 1024x576 首屏项目图，940KB
    ("blog.png", "webp", 82, None),       # 1024x576 首屏项目图，136KB
    ("GHS.png", "webp", 82, None),        # 1440x900
    ("SVG/vip.png", "webp", 82, 1200),    # 4120x1084 超宽
    ("tx.jpg", "jpg", 82, 400),           # 首屏头像，实际显示 112px
    ("wechat-qr.jpg", "jpg", 85, 900),    # 二维码，需保持清晰
]


def human(n):
    return f"{n/1024:.1f} KB" if n >= 1024 else f"{n} B"


def main():
    print(f"{'文件':<20}{'原体积':>12}{'新体积':>12}{'节省':>10}   说明")
    print("-" * 78)
    total_before = total_after = 0
    planned = []

    for rel, fmt, quality, max_w in JOBS:
        src = os.path.join(PUBLIC, rel.replace("/", os.sep))
        if not os.path.exists(src):
            print(f"{rel:<20}{'缺失':>12}")
            continue

        before = os.path.getsize(src)
        total_before += before

        im = Image.open(src)
        orig_size = im.size

        # 缩放
        if max_w and im.width > max_w:
            ratio = max_w / im.width
            im = im.resize((max_w, max(1, round(im.height * ratio))), Image.LANCZOS)

        # 目标文件名
        base, _ = os.path.splitext(src)
        dst = base + "." + fmt

        # JPEG 不支持 alpha
        if fmt == "jpg" and im.mode in ("RGBA", "P", "LA"):
            im = im.convert("RGB")
        if fmt == "webp" and im.mode == "P":
            im = im.convert("RGBA")

        # 试算：写入内存缓冲
        buf = io.BytesIO()
        save_kwargs = (
            {"quality": quality, "method": 6}
            if fmt == "webp"
            else {"quality": quality, "optimize": True, "progressive": True}
        )
        im.save(buf, PIL_FORMAT[fmt], **save_kwargs)
        after = buf.tell()
        total_after += after

        note = f"{orig_size[0]}x{orig_size[1]} → {im.size[0]}x{im.size[1]}"
        print(
            f"{rel:<20}{human(before):>12}{human(after):>12}"
            f"{100*(1-after/before):>9.1f}%   {note}  → {os.path.basename(dst)}"
        )

        planned.append((src, dst, buf.getvalue(), rel))

    print("-" * 78)
    saved = total_before - total_after
    print(
        f"{'合计':<20}{human(total_before):>12}{human(total_after):>12}"
        f"{100*saved/total_before:>9.1f}%   净省 {human(saved)}"
    )

    if not APPLY:
        print("\n[试算模式] 未写入任何文件。加 --apply 实际执行。")
        return

    print("\n正在写入...")
    for src, dst, data, rel in planned:
        with open(dst, "wb") as f:
            f.write(data)
        if os.path.normcase(dst) != os.path.normcase(src):
            os.remove(src)
            print(f"  写入 {os.path.basename(dst)}  (删除原 {os.path.basename(src)})")
        else:
            print(f"  覆盖 {os.path.basename(dst)}")
    print("完成。")


if __name__ == "__main__":
    main()
