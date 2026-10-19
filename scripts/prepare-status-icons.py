"""Extend the existing pixel icon library locally; no generative API or credits.
Profession icons reuse reviewed item art; status/dig marks use one shared pixel palette.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/ui/status'
OUT.mkdir(parents=True, exist_ok=True)
icons = {}
for name, sprite in [('warrior', 'W-A2'), ('mage', 'M-A2'), ('rogue', 'R-A2')]:
    src = Image.open(ROOT / f'src/assets/{sprite}.png').convert('RGBA')
    src = src.crop(src.getbbox())
    src.thumbnail((38, 38), Image.Resampling.NEAREST)
    image = Image.new('RGBA', (48, 48))
    image.alpha_composite(src, ((48-src.width)//2, (48-src.height)//2))
    icons[name] = image

for name in ['poison', 'burn', 'chill', 'break', 'mark', 'smoke', 'shield', 'rage', 'warning', 'minions', 'info', 'tome', 'dig']:
    img = Image.new('RGBA', (24, 24))
    d = ImageDraw.Draw(img)
    dark, light, shade = '#142832', '#e4d4aa', '#839eab'
    def poly(points, fill=light):
        d.polygon(points, fill=fill, outline=dark, width=1)
    if name in ('shield', 'break'):
        poly([(4,4),(12,2),(20,4),(19,14),(12,22),(5,14)])
        poly([(7,6),(12,4),(16,6),(15,13),(12,17),(8,13)], '#739da9')
        if name == 'break': d.line([(14,3),(10,10),(15,11),(10,21)], '#ffba82', 2)
    elif name == 'burn':
        poly([(12,1),(13,9),(18,5),(21,14),(19,20),(8,22),(3,17),(5,10),(8,12)], '#e47b50')
        poly([(12,9),(16,15),(14,20),(9,20),(8,16)], '#f5d07d')
    elif name == 'poison':
        poly([(9,2),(15,2),(15,8),(20,17),(18,21),(6,21),(4,17),(9,8)], '#85b863')
        d.rectangle((9,13,16,18), fill='#c5e48e'); d.rectangle((9,1,15,4), fill='#d2c7a0')
    elif name == 'chill':
        for points in [[(12,2),(12,22)],[(3,6),(21,18)],[(3,18),(21,6)]]: d.line(points, '#8bd9ef', 2)
        poly([(12,7),(16,12),(12,17),(8,12)], '#c1eff7')
    elif name == 'mark':
        d.ellipse((4,4,20,20), outline='#ccdf95', width=2)
        for points in [[(12,1),(12,7)],[(12,17),(12,23)],[(1,12),(7,12)],[(17,12),(23,12)]]: d.line(points, '#dcdfab',2)
        d.rectangle((10,10,14,14), fill='#95b268')
    elif name == 'smoke':
        d.ellipse((3,9,14,18), fill=dark); d.ellipse((8,3,19,15), fill=dark); d.ellipse((14,10,23,18), fill=dark)
        d.ellipse((4,9,15,16), fill='#a7a0c2'); d.ellipse((9,4,18,14), fill='#cabbe0'); d.ellipse((14,10,21,16), fill='#a7a0c2')
        d.line([(5,20),(19,20)], '#81729a',2)
    elif name == 'rage':
        poly([(2,2),(9,6),(12,1),(15,6),(22,2),(19,17),(12,23),(5,17)], '#cc654f')
        d.rectangle((6,10,9,12), fill='#ffdaa2');d.rectangle((15,10,18,12), fill='#ffdaa2')
    elif name == 'warning':
        poly([(12,1),(23,21),(1,21)], '#eac173');d.rectangle((11,7,13,14), fill=dark);d.rectangle((11,17,13,19), fill=dark)
    elif name == 'minions':
        d.ellipse((8,6,16,18), fill='#af92c5', outline=dark)
        for y in (8,12,16):
            d.line([(8,y),(3,y-3),(1,y+2)], '#bcabd0',2);d.line([(16,y),(21,y-3),(23,y+2)], '#bcabd0',2)
    elif name in ('tome', 'info'):
        if name == 'tome':
            poly([(3,3),(10,3),(12,5),(14,3),(21,3),(21,20),(14,20),(12,22),(10,20),(3,20)], '#b9a4d8')
            d.line([(12,5),(12,20)],dark,2);d.line([(5,7),(9,7)],light,1);d.line([(15,7),(19,7)],light,1)
        else:
            d.ellipse((2,2,22,22),fill='#415a66',outline='#d8cca8',width=2)
            d.rectangle((11,5,13,7),fill=light);d.rectangle((11,10,13,18),fill=light)
    else:
        d.line([(4,22),(17,5)],dark,5);d.line([(4,22),(17,5)],'#c59558',3)
        poly([(3,6),(13,2),(20,5),(23,11),(19,8),(12,6),(4,9)], '#b8c4c1')
    icons[name] = img.resize((48,48),Image.Resampling.NEAREST)
for name, image in icons.items(): image.save(OUT / f'{name}.png')
preview = Image.new('RGBA',(8*80,2*88),'#1b3039')
draw = ImageDraw.Draw(preview)
for n, (name,img) in enumerate(icons.items()):
    x,y=(n%8)*80,(n//8)*88
    preview.alpha_composite(img,(x+16,y+5));draw.text((x+5,y+58),name,fill='#ead8ab')
dest=ROOT/'art-direction/icons-v24';dest.mkdir(parents=True,exist_ok=True)
preview.save(dest/'profession-status-sheet.png')
lib=ROOT/'src/assets/library.json'
data=json.loads(lib.read_text(encoding='utf-8'))
for name in icons:
    key=f'ui/status/{name}'
    entry=next((x for x in data['entries'] if x['id']==key),None)
    source=f'复用正式物品 {dict(warrior="W-A2",mage="M-A2",rogue="R-A2")[name]} 缩放' if name in ('warrior','mage','rogue') else 'scripts/prepare-status-icons.py 本地像素绘制，无生成服务费用'
    if not entry:
        entry={'id':key,'path':f'src/assets/{key}.png'};data['entries'].append(entry)
    entry.update(group='职业与战斗状态图标',size=[48,48],alpha=True,source=source)
lib.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Prepared {len(icons)} icons; sources registered; no drawing credits used.')
