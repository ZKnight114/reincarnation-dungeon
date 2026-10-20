"""Split one reviewed Maker atlas into two reusable transparent panel skins."""
from pathlib import Path
import json
import shutil
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art-direction/panels-v26'
image = Image.open(ART / 'sources/Maker-弹板图集.png').convert('RGBA')
data = np.array(image)
r, g, b = (data[:, :, n].astype(np.int16) for n in range(3))
background = (r > 160) & (b > 160) & (g < 125) & (np.minimum(r, b) - g > 100)
data[background] = 0
clean = Image.fromarray(data)
record = {'source': 'TapTap Maker', 'atlasSize': list(image.size), 'request': 'AI弹板图集请求.json', 'panels': []}
library_path = ROOT / 'src/assets/library.json'
library = json.loads(library_path.read_text(encoding='utf-8'))
for index, name in enumerate(['event', 'guild']):
    start = index * image.width // 2
    region = clean.crop((start, 0, start + image.width // 2, image.height))
    box = region.getbbox()
    if not box or min(box[0], box[1], region.width-box[2], region.height-box[3]) < 6:
        raise ValueError(f'{name}: missing or clipped panel; inspect atlas')
    panel = region.crop(box)
    dest = ROOT / f'src/assets/ui/panels/{name}.png'
    dest.parent.mkdir(parents=True, exist_ok=True)
    preview = ART / f'assets/{name}.png'
    preview.parent.mkdir(parents=True, exist_ok=True)
    panel.save(preview)
    shutil.copy2(preview, dest)
    record['panels'].append({'id': name, 'crop': [start+box[0], box[1], start+box[2], box[3]], 'size': list(panel.size), 'nineSlice': [100, 38, 38, 38], 'runtime': str(dest)})
    asset_id = f'ui/panels/{name}'
    old = next((e for e in library['entries'] if e['id'] == asset_id), None)
    if old is None:
        old = {'id': asset_id, 'path': f'src/assets/{asset_id}.png'}
        library['entries'].append(old)
    old.update(group='通用弹板底板', size=list(panel.size), alpha=True,
               source='TapTap Maker v26 单张1024x1024双弹板图集拆分；medium / 1K，默认服务模型；请求、原图和裁切记录见 art-direction/panels-v26')
(ART / '切图记录.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
library_path.write_text(json.dumps(library, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps(record, ensure_ascii=False))
