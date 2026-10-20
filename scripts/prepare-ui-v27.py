"""Split the two completed Maker atlases. No image-generation requests.

Default: stage preview files. --install: copy reviewed siblings into asset library.
"""
from pathlib import Path
from collections import deque
import argparse
import json
import shutil
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art-direction/ui-v27-light'
parser = argparse.ArgumentParser()
parser.add_argument('--install', action='store_true')
args = parser.parse_args()


def clean_atlas(name):
    im = Image.open(ART / f'sources/{name}.png').convert('RGBA')
    data = np.array(im)
    r, g, b = (data[:, :, n].astype(np.int16) for n in range(3))
    candidate = (r > 170) & (b > 150) & (g < 120) & (np.minimum(r, b) - g > 90)
    # Only the connected exterior background is removed; violet interior stays.
    height, width = candidate.shape
    exterior = np.zeros_like(candidate)
    queue = deque([(0, 0)])
    exterior[0, 0] = True
    while queue:
        y, x = queue.popleft()
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < height and 0 <= xx < width and candidate[yy, xx] and not exterior[yy, xx]:
                exterior[yy, xx] = True
                queue.append((yy, xx))
    data[exterior] = 0
    return Image.fromarray(data)


record = {'source': 'TapTap Maker', 'requests': 'requests.json', 'assets': []}
dest_folder = ART / 'assets'
dest_folder.mkdir(parents=True, exist_ok=True)
banners = clean_atlas('resonance-atlas')
panels = clean_atlas('panel-atlas')
specs = [
    ('ui/resonance/low', banners, (0, 0, 1024, 341), 16, 6, 'resonance-atlas'),
    ('ui/resonance/advanced', banners, (0, 341, 1024, 682), 16, 6, 'resonance-atlas'),
    ('ui/resonance/high', banners, (0, 682, 1024, 1024), 16, 6, 'resonance-atlas'),
    ('ui/panels/light-event', panels, (0, 0, 512, 640), 24, 10, 'panel-atlas'),
    ('ui/panels/light-guild', panels, (512, 0, 1024, 640), 24, 10, 'panel-atlas'),
    ('ui/insets/light', panels, (0, 640, 512, 820), 22, 7, 'panel-atlas'),
    ('ui/insets/dark', panels, (512, 640, 1024, 820), 22, 7, 'panel-atlas'),
    ('ui/buttons/light-primary', panels, (0, 820, 341, 1024), 24, 10, 'panel-atlas'),
    ('ui/buttons/light-secondary', panels, (341, 820, 682, 1024), 24, 10, 'panel-atlas'),
    ('ui/buttons/light-disabled', panels, (682, 820, 1024, 1024), 24, 10, 'panel-atlas'),
]
for asset_id, atlas, region, source_cut, display_cut, source in specs:
    part = atlas.crop(region)
    box = part.getbbox()
    if not box:
        raise ValueError(f'{asset_id}: empty crop')
    if min(box[0], box[1], part.width - box[2], part.height - box[3]) < 6:
        raise ValueError(f'{asset_id}: crop may be clipped, inspect source grid')
    asset = part.crop(box)
    filename = asset_id.replace('/', '-') + '.png'
    staged = dest_folder / filename
    asset.save(staged)
    record['assets'].append({
        'id': asset_id, 'staged': f'assets/{filename}',
        'runtime': f'src/assets/{asset_id}.png', 'sourceAtlas': f'sources/{source}.png',
        'crop': [region[0] + box[0], region[1] + box[1], region[0] + box[2], region[1] + box[3]],
        'size': list(asset.size), 'nineSlice': [source_cut] * 4,
        'displayEdge': display_cut,
    })

(ART / 'slices.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if args.install:
    path = ROOT / 'src/assets/library.json'
    library = json.loads(path.read_text(encoding='utf-8'))
    entries = {item['id']: item for item in library['entries']}
    for item in record['assets']:
        target = ROOT / item['runtime']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ART / item['staged'], target)
        entries[item['id']] = {
            'id': item['id'], 'path': item['runtime'], 'group': '轻框纹理UI-v27',
            'size': item['size'], 'alpha': True,
            'source': 'TapTap Maker v27：两张1024x1024整图拆分；默认服务模型，medium / 1K；请求、原图与九宫切片见 art-direction/ui-v27-light',
        }
    library['entries'] = list(entries.values())
    path.write_text(json.dumps(library, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print(json.dumps(record, ensure_ascii=False, indent=2))
