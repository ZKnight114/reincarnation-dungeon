"""Prepare the nine approved AI enemy renders as transparent, left-facing sprites."""
from pathlib import Path
from collections import deque
import argparse
import json
import shutil
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'art-direction/enemies-v15'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, help='Directory containing the nine original enemy renders')
args = parser.parse_args()
SOURCE = args.source or (ART / 'sources' if (ART / 'sources').exists() else ROOT.parent / 'maker-project/assets/image')
KEYS = ['slime', 'bat', 'wolf', 'spider', 'wraith', 'ogre', 'golem', 'dragon', 'queen']
ART.mkdir(parents=True, exist_ok=True)
(ART / 'sources').mkdir(exist_ok=True)
records = []
contact = Image.new('RGB', (960, 720), '#203436')
draw = ImageDraw.Draw(contact)
for n, key in enumerate(KEYS):
    candidates = sorted(SOURCE.glob(f'guild_enemy_v15_{key}_*.png'))
    if not candidates:
        raise FileNotFoundError(f'Missing {key} render in {SOURCE}; supply --source with the original render directory')
    source = candidates[-1]
    if source.resolve() != (ART / 'sources' / source.name).resolve():
        shutil.copy2(source, ART / 'sources' / source.name)
    im = Image.open(source).convert('RGBA')
    if Image.open(source).mode == 'RGB':
        # Flood only exterior chroma/near-white pixels. Interior highlights stay intact.
        px = im.load()
        seen = set()
        queue = deque([(x, y) for x in range(im.width) for y in [0, im.height - 1]] +
                      [(x, y) for y in range(im.height) for x in [0, im.width - 1]])
        while queue:
            x, y = queue.popleft()
            if (x, y) in seen or x < 0 or y < 0 or x >= im.width or y >= im.height:
                continue
            seen.add((x, y))
            r, g, b, a = px[x, y]
            if (r > 145 and b > 145 and g < 105 and min(r, b) > g * 1.6) or min(r, g, b) > 245:
                px[x, y] = (0, 0, 0, 0)
                queue.extend([(x-1, y), (x+1, y), (x, y-1), (x, y+1)])
        # Remove residual key fringes, independent of enclosed silhouette gaps.
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if r > 70 and b > 70 and min(r, b) - g > 25 and min(r, b) > g * 1.12:
                    px[x, y] = (0, 0, 0, 0)
    alpha = im.getchannel('A').point(lambda a: 255 if a >= 30 else 0)
    bbox = alpha.getbbox()
    assert bbox, key
    im = im.crop(bbox)
    # Limit to a real sprite-sized raster instead of shipping 1K source images.
    im.thumbnail((240, 240), Image.Resampling.LANCZOS)
    # The spider render contains a one-pixel horizontal key line below its feet.
    # Remove an isolated full-width bottom scanline, retaining the actual silhouette.
    if key == 'spider':
        bottom = sum(im.getpixel((x, im.height-1))[3] > 20 for x in range(im.width))
        above = sum(im.getpixel((x, im.height-2))[3] > 20 for x in range(im.width))
        if bottom > im.width * .8 and above < im.width * .25:
            im = im.crop((0, 0, im.width, im.height-1))
    canvas = Image.new('RGBA', (256, 256))
    canvas.alpha_composite(im, ((256-im.width)//2, 248-im.height))
    dest = ROOT / 'src/assets' / f'enemy-{key}-full.png'
    canvas.save(dest, optimize=True)
    records.append({'key': key, 'source': source.name, 'file': str(dest.relative_to(ROOT)),
                    'provider': 'TapTap Maker (server default model)', 'facing': 'left',
                    'size': [256, 256], 'bytes': dest.stat().st_size})
    tile = canvas.resize((220, 220), Image.Resampling.NEAREST)
    contact.paste(tile, ((n%3)*320+50, (n//3)*240), tile)
    draw.text(((n%3)*320+16, (n//3)*240+222), key, fill='#ead5a1')
contact.save(ART / '敌人图鉴.png')
(ART / '素材记录.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(records, ensure_ascii=False))
