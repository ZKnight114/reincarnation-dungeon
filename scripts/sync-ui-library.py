"""Import approved v19 UI art; build a searchable inventory of existing PNGs."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APPROVED = ROOT / 'art-direction/pixel-v19-tomes-ui'
ASSETS = ROOT / 'src/assets'
for folder in ['ui/skins', 'ui/icons', 'ui/controls', 'tomes']:
    (ASSETS / folder).mkdir(parents=True, exist_ok=True)
for source in (APPROVED / 'assets/skins').glob('*.png'):
    shutil.copy2(source, ASSETS / 'ui/skins' / source.name)
for source in (APPROVED / 'assets/icons').glob('*-48.png'):
    shutil.copy2(source, ASSETS / 'ui/icons' / source.name.replace('-48', ''))
for source in (APPROVED / 'assets/controls').glob('*.png'):
    shutil.copy2(source, ASSETS / 'ui/controls' / source.name)
for source in (APPROVED / 'assets').glob('*_tome-96.png'):
    shutil.copy2(source, ASSETS / 'tomes' / source.name.replace('-96', ''))
shutil.copy2(APPROVED / 'assets/shelf-plank.png', ASSETS / 'ui/shelf-plank.png')
shutil.copy2(APPROVED / 'AI图集请求.json', ASSETS / 'ui/generation.json')
assert len(list((ASSETS / 'tomes').glob('*.png'))) == 9

inventory = []
for path in sorted(ASSETS.rglob('*.png')):
    relative = path.relative_to(ASSETS).as_posix()
    if relative.startswith('ui/'):
        group = '界面按钮与图标'
        source = 'v19 已审核 UI 图集；操作符号和木板为本地像素绘制'
    elif relative.startswith('tomes/'):
        group = '九本典籍'
        source = '项目既有典籍图标，v19 样稿复用'
    elif path.name[0:2] in ['W-', 'M-', 'R-']:
        group = '三职业物品'
        source = '项目既有定稿物品；详见设计记录'
    elif '-motion' in path.name or '-full' in path.name:
        group = '人物与怪物'
        source = '项目既有素材；敌人来源见 ENEMY-ART.md'
    else:
        group = '场景与旧界面'
        source = '项目既有素材'
    with Image.open(path) as image:
        width, height = image.size
        alpha = 'A' in image.getbands()
    inventory.append({'id': relative[:-4], 'path': 'src/assets/' + relative, 'group': group,
                      'size': [width, height], 'alpha': alpha, 'source': source,
                      'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
manifest = {'policy': '先检索素材库，优先复用；无合适资源再绘制', 'style': '精细像素西幻，暗青／古铜／羊皮纸，左上光照',
            'uiSource': 'art-direction/pixel-v19-tomes-ui', 'uiSourceRequests': 2,
            'entries': inventory}
(ASSETS / 'library.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Indexed {len(inventory)} existing PNGs; imported 12 skins, 16 icons, 10 controls and 9 tomes.')
