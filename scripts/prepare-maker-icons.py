"""Split the reviewed Maker v25 atlases; never call a generation service.

The original atlases, transparent cuts and old runtime assets stay in art-direction.
Use --install only after inspecting the preview at real UI sizes.
"""
from pathlib import Path
import argparse
import json
import shutil
import sys
import zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'art-direction/icons-v25'
SYMBOLS = [
    ('warrior', '战士', 'status'), ('mage', '法师', 'status'), ('rogue', '盗贼', 'status'),
    ('sword', '剑', 'categories'), ('spear', '枪', 'categories'),
    ('shield', '防御', 'categories'), ('staff', '法杖', 'categories'),
    ('focus', '法球', 'categories'), ('ranged', '弩', 'categories'),
    ('support', '辅助', 'categories'),
]
STATUSES = [(key, name, 'status') for key, name in [
    ('poison', '中毒'), ('burn', '灼烧'), ('chill', '减速'), ('break', '破防'),
    ('mark', '标记'), ('smoke', '烟幕'), ('shield', '护盾'), ('rage', '狂暴'),
    ('warning', '技能预告'), ('minions', '召唤物'), ('info', '状态详情'),
    ('tome', '典籍技能'), ('dig', '挖掘'),
]]


def chroma_key(image):
    data = np.array(image.convert('RGBA'), dtype=np.uint8)
    red, green, blue = [data[:, :, n].astype(np.int16) for n in range(3)]
    background = (red > 170) & (blue > 170) & (green < 130) & (np.minimum(red, blue) - green > 110)
    data[background] = 0
    return Image.fromarray(data)


def separators(mask, count, axis):
    alpha = np.array(mask)
    occupied = np.count_nonzero(alpha > 0, axis=axis)
    bounds = [0]
    for n in range(1, count):
        center = round(len(occupied) * n / count)
        radius = round(len(occupied) / count * .3)
        safe = [x for x in range(max(1, center-radius), min(len(occupied)-1, center+radius)) if occupied[x] == 0]
        if not safe:
            raise ValueError(f'No safe {axis=} split at {center}; inspect original instead of clipping artwork')
        bounds.append(min(safe, key=lambda x: abs(x-center)))
    return bounds + [len(occupied)]


def cut(path, sheet_id, rows, entries, record):
    source = Image.open(path).convert('RGBA')
    shutil.copy2(path, ART / 'sources' / f'{sheet_id}-original.png')
    image = chroma_key(source)
    image.save(ART / 'sources' / f'{sheet_id}-transparent.png')
    xs = separators(image.getchannel('A'), 4, 0)
    ys = separators(image.getchannel('A'), rows, 1)
    result = {'id': sheet_id, 'source': str(path), 'size': list(image.size), 'xSplits': xs, 'ySplits': ys, 'icons': []}
    for index, (key, label, group) in enumerate(entries):
        row, column = divmod(index, 4)
        region = (xs[column], ys[row], xs[column+1], ys[row+1])
        cell = image.crop(region)
        box = cell.getbbox()
        if not box or box[0] < 2 or box[1] < 2 or box[2] > cell.width-2 or box[3] > cell.height-2:
            raise ValueError(f'{key}: missing or clipped icon ({box}, {region})')
        subject = cell.crop(box)
        subject.save(ART / 'assets' / group / f'{key}-source.png')
        for size in (16, 18, 24, 48, 64, 96):
            canvas = Image.new('RGBA', (size, size))
            margin = 1 if size <= 24 else 2
            icon = subject.copy()
            icon.thumbnail((size-margin*2, size-margin*2), Image.Resampling.LANCZOS)
            canvas.alpha_composite(icon, ((size-icon.width)//2, (size-icon.height)//2))
            canvas.save(ART / 'assets' / group / f'{key}-{size}.png')
        result['icons'].append({'key': key, 'name': label, 'group': group, 'region': region, 'bounds': list(box), 'complete': True, 'output': f'assets/{group}/{key}-48.png'})
    # Empty spare cells must remain empty; unexpected icons are not silently assigned.
    for index in range(len(entries), rows*4):
        row, column = divmod(index, 4)
        region = (xs[column], ys[row], xs[column+1], ys[row+1])
        if image.crop(region).getbbox():
            raise ValueError(f'Unexpected content in spare cell {sheet_id}/{index}')
    record['atlases'].append(result)


def preview(entries):
    font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 17)
    title_font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 27)
    all_entries = SYMBOLS + STATUSES
    image = Image.new('RGB', (1100, 740), '#11252d')
    draw = ImageDraw.Draw(image)
    draw.text((30, 22), '冒险公会 · 统一职业 / 物品类别 / 状态图标', font=title_font, fill='#ead6a0')
    draw.text((30, 62), 'Maker整图绘制后拆分 · 每格展示48px图与18px实机尺寸 · 标签不包含在透明素材中', font=font, fill='#b4c8c0')
    groups = [('职业', SYMBOLS[:3]), ('物品类别', SYMBOLS[3:]), ('状态与功能', STATUSES)]
    top = 110
    for heading, symbols in groups:
        draw.text((30, top), heading, font=font, fill='#e1c581')
        for index, (key, name, group) in enumerate(symbols):
            row, col = divmod(index, 7)
            x, y = 30+col*150, top+35+row*114
            draw.rectangle((x, y, x+136, y+101), fill='#1c343c')
            icon = Image.open(ART / 'assets' / group / f'{key}-48.png').convert('RGBA')
            image.paste(icon, (x+13, y+8), icon)
            tiny = Image.open(ART / 'assets' / group / f'{key}-18.png').convert('RGBA')
            image.paste(tiny, (x+91, y+26), tiny)
            draw.text((x+13, y+68), name, font=font, fill='#dfd3b2')
        top += 35+((len(symbols)+6)//7)*114+18
    image.save(ART / '统一图标样稿.png')
    cards = ''.join(f'<article><img class="large" src="assets/{group}/{key}-96.png"><strong>{name}</strong><div class="sizes">' + ''.join(f'<span><img src="assets/{group}/{key}-{size}.png" width="{size}" height="{size}"><small>{size}px</small></span>' for size in (16,18,24,48)) + f'</div><small>{group}/{key}</small></article>' for key,name,group in all_entries)
    html = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>冒险公会 · 统一图标样稿</title><style>body{margin:0;background:#10242c;color:#e0d5ba;font:15px "Microsoft YaHei",sans-serif}main{max-width:1180px;margin:30px auto;padding:0 20px}h1{color:#e8d09a;font-size:26px}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:16px}article{background:#1b333c;padding:18px;display:grid;justify-items:center;gap:12px}img{object-fit:contain;image-rendering:pixelated}.large{width:96px;height:96px}.sizes{display:flex;align-items:end;gap:16px}.sizes span{display:grid;justify-items:center;gap:8px}small{color:#a8b7b2}body.light{background:#e4d8b3;color:#342e23}body.light article{background:#f5e8c8}body.light h1,body.light small{color:#554329}button,a{background:#c9ae70;color:#152a31;padding:10px 16px;border:0;cursor:pointer;display:inline-block;margin-bottom:20px;text-decoration:none}p{line-height:1.7}</style><main><h1>冒险公会 · 统一图标样稿</h1><p>23枚：3职业、7物品类别、13状态与功能。精细像素西幻，左上光源、金属／皮革／晶体材质。两张Maker图集生成后拆分；标签与展示底板仅属于预览。</p><button onclick="document.body.classList.toggle('light')">切换深色／浅色背景</button><a href="统一图标-透明PNG.zip">下载透明图标</a><div class="gallery">'''+cards+'</div></main></html>'
    (ART / '统一图标样稿.html').write_text(html, encoding='utf-8')
    with zipfile.ZipFile(ART / '统一图标-透明PNG.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for key, _, group in all_entries:
            archive.write(ART / 'assets' / group / f'{key}-48.png', f'{group}/{key}.png')


def install():
    library = ROOT / 'src/assets/library.json'
    data = json.loads(library.read_text(encoding='utf-8'))
    for key, name, group in SYMBOLS+STATUSES:
        destination = ROOT / 'src/assets/ui' / group / f'{key}.png'
        backup = ART / 'before-assets' / group / f'{key}.png'
        if destination.exists() and not backup.exists():
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(destination, backup)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ART / 'assets' / group / f'{key}-48.png', destination)
        asset_id = f'ui/{group}/{key}'
        entry = next((e for e in data['entries'] if e['id'] == asset_id), None)
        if entry is None:
            entry = {'id': asset_id, 'path': f'src/assets/{asset_id}.png'}
            data['entries'].append(entry)
        entry.update(group='职业与物品类别图标' if (key,name,group) in SYMBOLS else '战斗状态与功能图标', size=[48,48], alpha=True,
                     source='TapTap Maker v25 两张图集拆分；请求、原图和切图记录见 art-direction/icons-v25；medium / 1K，默认服务模型')
    library.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--profession-sheet', required=True, type=Path)
    parser.add_argument('--status-sheet', required=True, type=Path)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    for directory in ['sources', 'assets/status', 'assets/categories']:
        (ART / directory).mkdir(parents=True, exist_ok=True)
    record = {'generator': 'TapTap Maker', 'generationRequests': 2, 'runtimeSize': [48,48], 'atlases': []}
    cut(args.profession_sheet, 'profession-category', 3, SYMBOLS, record)
    cut(args.status_sheet, 'battle-status', 4, STATUSES, record)
    (ART / '切图记录.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    preview(record)
    if args.install:
        install()
    print('23 complete icons split; small-size preview and transparent PNG package saved; install='+str(args.install))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
