"""Create web copies while keeping the original photos untouched."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
before = after = 0
for source in sorted((root / 'images').glob('rufus-*.jpg')):
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        target = source.with_suffix('.webp')
        image.save(target, 'WEBP', quality=82, method=6)
        before += source.stat().st_size
        after += target.stat().st_size
        print(f'{target.name}: {image.width}x{image.height}, {target.stat().st_size // 1024} KB')

canvas = Image.new('RGB', (1200, 630), '#f3f1e9')
draw = ImageDraw.Draw(canvas)
font_dir = Path('C:/Windows/Fonts')
large = ImageFont.truetype(str(font_dir / 'arial.ttf'), 132)
small = ImageFont.truetype(str(font_dir / 'arial.ttf'), 26)
draw.line((60, 90, 1140, 90), fill='#cccac0', width=2)
draw.text((60, 40), 'arielh.com', font=small, fill='#68685f')
draw.text((57, 160), 'Ariel', font=large, fill='#25251f')
draw.text((57, 290), 'Hirschberg', font=large, fill='#25251f')
draw.ellipse((740, 397, 763, 420), fill='#db481e')
draw.line((60, 500, 1140, 500), fill='#25251f', width=2)
draw.text((60, 536), 'Games, tools & other things.', font=small, fill='#68685f')
canvas.save(root / 'images/social-card.png', optimize=True)
print(f'Rufus: {before // 1024} KB -> {after // 1024} KB ({100 - after * 100 / before:.0f}% smaller)')
