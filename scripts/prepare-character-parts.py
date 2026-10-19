"""Deterministic import of the two approved Maker sprite sheets; no generation calls."""
from pathlib import Path
import json, shutil
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('E:/codex/maker-project/assets/image')
REVIEW = ROOT / 'art-direction/characters-v21'
TARGET = ROOT / 'src/assets/characters'
REVIEW.mkdir(parents=True, exist_ok=True)

def key(image):
    image = image.convert('RGBA')
    data = []
    for r,g,b,a in image.getdata():
        if r > 155 and b > 140 and g < 110 and r+b-2*g > 210:
            data.append((0,0,0,0))
        else:
            data.append((r,g,b,a))
    image.putdata(data)
    return image

def layer(image, box, path):
    canvas = Image.new('RGBA', (128,192))
    canvas.alpha_composite(image, box)
    dest = TARGET / (path+'.png')
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, optimize=True)
    return canvas

def fitted(image, width, height):
    image = image.crop(image.getbbox())
    ratio = min(width/image.width, height/image.height)
    return image.resize((round(image.width*ratio),round(image.height*ratio)), Image.Resampling.NEAREST)

faces_name = 'guild_v21_faces_hair_sheet_20261019053510.png'
clothes_name = 'guild_v21_clothing_sheet_20261019053510.png'
for name in (faces_name, clothes_name):
    shutil.copyfile(SOURCE/name, REVIEW/name)
faces = key(Image.open(SOURCE/faces_name))
clothes = key(Image.open(SOURCE/clothes_name))
layers = {}
for row,gender in enumerate(('male','female')):
    for col in range(4):
        crop = faces.crop((col*256,row*256,(col+1)*256,(row+1)*256))
        layers[f'heads/{gender}-{col}'] = layer(crop.resize((64,64),Image.Resampling.NEAREST),(32,0),f'heads/{gender}-{col}')
for n in range(8):
    row,col = 2+n//4,n%4
    crop = faces.crop((col*256,row*256,(col+1)*256,(row+1)*256))
    data=[]
    for index,(r,g,b,a) in enumerate(crop.getdata()):
        # The sheet included ears/necks in the hair cells. Keep the head's own skin.
        x,y=index%256,index//256
        skin = a and 65<x<155 and y>138 and r>110 and g>55 and r>g and g>b and r-b>48 and r/g<2.8
        data.append((0,0,0,0) if skin else (r,g,b,a))
    crop.putdata(data)
    layers[f'hair/{n}'] = layer(crop.resize((64,64),Image.Resampling.NEAREST),(32,0),f'hair/{n}')

# Seven natural bands: warrior torso/legs, mage torso/skirt/legs, rogue torso/legs.
bands=[]; start=None
for y in range(clothes.height):
    occupied = clothes.getchannel('A').crop((0,y,clothes.width,y+1)).getbbox() is not None
    if occupied and start is None: start=y
    if not occupied and start is not None:
        if y-start>30: bands.append((start,y))
        start=None
if start is not None: bands.append((start,clothes.height))
assert len(bands)==7, bands
for profession,torso_row,leg_row in (('warrior',0,1),('mage',2,4),('rogue',5,6)):
    for n in range(4):
        def crop_row(row):
            y0,y1=bands[row]
            return clothes.crop((n*384,y0,(n+1)*384,y1))
        source_torso=crop_row(torso_row)
        torso=source_torso.crop(source_torso.getbbox()).resize((84,64),Image.Resampling.NEAREST)
        layers[f'{profession}/torso-{n}']=layer(torso,((128-torso.width)//2,53),f'{profession}/torso-{n}')
        legs=fitted(crop_row(leg_row),68,69)
        if profession=='mage':
            skirt=fitted(crop_row(3),82,45)
            canvas=Image.new('RGBA',(128,192))
            canvas.alpha_composite(legs,((128-legs.width)//2,112))
            canvas.alpha_composite(skirt,((128-skirt.width)//2,110))
            layers[f'{profession}/legs-{n}']=layer(canvas,(0,0),f'{profession}/legs-{n}')
        else:
            layers[f'{profession}/legs-{n}']=layer(legs,((128-legs.width)//2,112),f'{profession}/legs-{n}')

manifest={'version':1,'canvas':[128,192],'order':['legs','torso','head','hair'],
          'headCount':4,'hairCount':8,'torsoCount':4,'legsCount':4,
          'source':'TapTap Maker, 2026-10-19, two whole sprite sheets; requests preserved in art-direction/characters-v21',
          'sourceSheets':[faces_name,clothes_name],'layers':list(layers)}
(TARGET/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
review=Image.new('RGB',(768,720),'#203336')
draw=ImageDraw.Draw(review)
for row,profession in enumerate(('warrior','mage','rogue')):
    for col in range(6):
        canvas=Image.new('RGBA',(128,192))
        gender='female' if col%2 else 'male'
        for part in (f'{profession}/legs-{col%4}',f'{profession}/torso-{(col+row)%4}',f'heads/{gender}-{col%4}',f'hair/{col%8}'):
            canvas.alpha_composite(layers[part])
        review.paste(canvas,(col*128,row*240+20),canvas)
        draw.text((col*128+8,row*240+214),f'{profession} / {gender}',fill='#f3ddb5')
review.save(REVIEW/'组合人物预览.png')
print(f'Imported {len(layers)} aligned layers. Natural bands: {bands}')
