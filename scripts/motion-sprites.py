"""Create compact pixel motion frames from the approved artwork; keep source art intact."""
from pathlib import Path
from PIL import Image
import math

root = Path(__file__).resolve().parent.parent / 'src' / 'assets'
for name in ['warrior', 'mage', 'rogue']:
    source = Image.open(root / f'{name}-full.png').convert('RGBA')
    source.thumbnail((86, 128), Image.Resampling.NEAREST)
    base = Image.new('RGBA', (96, 136))
    base.alpha_composite(source, ((96-source.width)//2, 134-source.height))
    sheet = Image.new('RGBA', (96*6, 136*4))
    for row in range(4):  # idle, walk, strike, hurt
        for frame in range(6):
            canvas = Image.new('RGBA', (96, 136))
            swing = math.sin(frame/6*math.tau)
            for y in range(136):
                shift = 0
                if row == 1 and y > 90:
                    # Opposing horizontal movement of the legs, body stays planted.
                    strip = base.crop((0,y,96,y+1))
                    for half in range(2):
                        part = strip.crop((half*48,0,(half+1)*48,1))
                        dx = round(swing * (y-90)/46 * 3) * (1 if half else -1)
                        canvas.alpha_composite(part, (half*48+dx,y-round(abs(swing)*2)))
                    continue
                if row == 2: shift = round(math.sin(frame/5*math.pi)*6 * max(0,1-y/136))
                if row == 3: shift = round(-math.sin(frame/5*math.pi)*4)
                dy = round(abs(swing)) if row in [0,1] else 0
                canvas.alpha_composite(base.crop((0,y,96,y+1)), (shift,y-dy))
            sheet.alpha_composite(canvas, (frame*96,row*136))
    sheet.save(root / f'{name}-motion.png', optimize=True)
