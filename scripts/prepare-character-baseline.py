"""V23 full-body based wardrobe import. No image generation or part stretching.

Default writes staged parts and review sheets. --install updates formal assets only
after inspecting the real combinations. Original V21 files are backed up once.
"""
from pathlib import Path
import argparse, json, shutil
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'art-direction/characters-v23'
STAGED = REVIEW / 'parts'
TARGET = ROOT / 'src/assets/characters'
FACES = ROOT / 'art-direction/characters-v21/guild_v21_faces_hair_sheet_20261019053510.png'
JOBS = ('warrior', 'mage', 'rogue')
SIZE = (128, 192)
HEAD_DROP = 3
args = argparse.ArgumentParser()
args.add_argument('--install', action='store_true')
install = args.parse_args().install
parts, sources, full = {}, {}, {}

def binary(im):
    im = im.convert('RGBA')
    im.putalpha(im.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
    im.putdata([(r,g,b,a) if a else (0,0,0,0) for r,g,b,a in im.getdata()])
    return im

def keep(im, condition):
    out = im.copy()
    out.putdata([c if condition(x,y,c) else (0,0,0,0)
                 for y in range(im.height) for x in range(im.width)
                 for c in [im.getpixel((x,y))]])
    return out

def polygon_mask(polygons):
    mask = Image.new('L',SIZE)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(polygon,fill=255)
    return mask

def row_runs(im,y):
    runs=[]
    start=None
    for x in range(im.width):
        if im.getpixel((x,y))[3] and start is None:
            start=x
        if not im.getpixel((x,y))[3] and start is not None:
            runs.append((start,x-1));start=None
    if start is not None:runs.append((start,im.width-1))
    return runs

def skin_pixel(c):
    r,g,b,a=c
    return a and r>110 and g>60 and r>g>b and b>g*.46 and r-g>18

def neck_skin(c):
    r,g,b,a=c
    return a and r>95 and g>45 and r>g>b and r-g>18

def luminance(c):
    return .2126*c[0]+.7152*c[1]+.0722*c[2]

def shaded_neck(native,template):
    # Keep the actual jaw/neck shadows. The old solid extension severed their
    # diagonal edge and made the neck look like an unrelated rectangular peg.
    palette=sorted(set(native.getpixel((x,y)) for y in range(35,40)
                       for x in range(55,67) if neck_skin(native.getpixel((x,y)))),
                   key=luminance)
    opening=polygon_mask(NECK_OPENINGS['rogue'][3])
    samples=[template.getpixel((x,y)) for y in range(41,53) for x in range(56,67)
             if opening.getpixel((x,y)) and neck_skin(template.getpixel((x,y)))]
    low,high=min(map(luminance,samples)),max(map(luminance,samples))
    root=[(x,native.getpixel((x,39))) for x in range(55,67)
          if neck_skin(native.getpixel((x,39)))]
    assert palette and root and high>low
    neck=Image.new('RGBA',SIZE)
    ImageDraw.Draw(neck).polygon([(56,40),(65,40),(69,45),(69,54),(54,54),(54,45)],
                                fill=palette[len(palette)//2])
    for y in range(40,55):
        for x in range(54,70):
            if not neck.getpixel((x,y))[3]:continue
            c=template.getpixel((min(65,max(56,x)),min(51,max(41,y))))
            intensity=max(0,min(1,(luminance(c)-low)/(high-low)))
            lower=palette[round(intensity*(len(palette)-1))]
            upper=min(root,key=lambda p:abs(p[0]-x))[1]
            blend=max(0,min(1,(y-(39+HEAD_DROP))/6))
            neck.putpixel((x,y),tuple(round(upper[k]*(1-blend)+lower[k]*blend)
                                      for k in range(3))+(255,))
    # Move head AND hair together. Chin y37/38 now matches the complete body,
    # instead of floating three pixels above its anatomical collar position.
    neck.alpha_composite(keep(native,lambda x,y,c:y<40),(0,HEAD_DROP))
    return neck

NECK_OPENINGS={
    'warrior':[
        [[(61,41),(62,41),(62,42)]],
        [[(61,41),(62,41),(62,42)]],
        [[(62,41),(62,42)]],
        [[(60,41),(62,41),(61,43)]]],
    'mage':[
        [[(62,41),(64,41)]],[],[],[[(62,41),(65,41)]]],
    'rogue':[
        [[(59,41),(63,41),(63,48),(60,52),(58,47)]],
        [[(59,41),(63,41),(63,47),(60,51),(59,46)]],
        [[(58,41),(63,41),(63,46),(60,51),(58,46)]],
        [[(57,41),(63,41),(66,45),(64,48),(61,52),(59,51),(56,46)]]],
}

def clear_original_neck(im,job,n):
    # Garment layers must not carry the original model's head or exposed neck.
    # Keep collar pixels; only the calibrated skin opening becomes transparent.
    opening=polygon_mask(NECK_OPENINGS[job][n])
    return keep(im,lambda x,y,c:not(opening.getpixel((x,y)) and skin_pixel(c)))

def save(name, im, source):
    im = binary(im)
    assert im.size == SIZE
    parts[name] = im
    path = STAGED / (name + '.png')
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)
    sources[name] = source

# The image generator completed full characters on a shared reference. Fit the
# WHOLE figure, then cut masks on that canvas; never stretch torso and legs.
for job in JOBS:
    sheet = binary(Image.open(REVIEW / (job + '-原图.png')))
    assert sheet.size == (1024,1536)
    for n in range(4):
        box = (n%2*512,n//2*768,(n%2+1)*512,(n//2+1)*768)
        cell = sheet.crop(box)
        bounds = cell.getbbox()
        assert bounds and bounds[0]>0 and bounds[1]>0 and bounds[2]<512 and bounds[3]<768
        cropped = cell.crop(bounds)
        fitted = ImageOps.contain(cropped,(78,168),Image.Resampling.NEAREST)
        canvas = Image.new('RGBA',SIZE)
        offset = ((128-fitted.width)//2,182-fitted.height)
        canvas.alpha_composite(fitted,offset)
        full[(job,n)] = canvas

# Reuse clear V21 heads/hair, recalibrated to the complete-body neck position.
# Remove the magenta matte while retaining actual warm hair and skin colors.
faces = Image.open(FACES).convert('RGBA')
faces.putdata([(0,0,0,0) if (r>155 and b>140 and g<110 and r+b-2*g>210) or
               (min(r,b)-g>18 and r+b-2*g>48)
               else (r,g,b,a) for r,g,b,a in faces.getdata()])
for row, gender in enumerate(('male','female')):
    for n in range(4):
        crop = faces.crop((n*256,row*256,(n+1)*256,(row+1)*256))
        crop = crop.resize((41,41),Image.Resampling.NEAREST)
        head = Image.new('RGBA',SIZE)
        head.alpha_composite(crop,(42,6))
        head=shaded_neck(head,full[('rogue',3)])
        save(f'heads/{gender}-{n}',head,
             'V21 native jaw/neck shadows; head and hair lowered 3px; v23 rogue chest lighting remapped to native skin palette')
for n in range(8):
    row,col = 2+n//4,n%4
    hair = faces.crop((col*256,row*256,(col+1)*256,(row+1)*256))
    # The old short-hair sheet also drew ears and necks. Remove skin only in
    # that calibrated region; do not broadly key out blonde hair highlights.
    if n<4:
        hair = keep(hair,lambda x,y,c:not(
            (y>193) or
            (65<x<158 and y>136 and c[3] and c[0]>110 and c[1]>55 and
             c[0]>c[1]>c[2] and c[0]-c[2]>48 and c[0]/max(1,c[1])<2.8)))
    # Several female wigs also included ears, a jaw outline and an extra neck.
    # Use explicit masks rather than deleting blonde/tan colors globally.
    hole = Image.new('L',(256,256))
    hd=ImageDraw.Draw(hole)
    hd.polygon([(111,155),(143,176),(180,164),(180,256),(111,256)],fill=255)
    if n in (5,7):
        hd.polygon([(88,112),(109,111),(117,145),(105,159),(89,140)],fill=255)
        hd.polygon([(105,160),(132,175),(143,199),(136,221),(104,208)],fill=255)
    hair=keep(hair,lambda x,y,c:not(hole.getpixel((x,y))))
    hair = hair.resize((41,41),Image.Resampling.NEAREST)
    layer = Image.new('RGBA',SIZE)
    layer.alpha_composite(hair,(42,6+HEAD_DROP))
    back = keep(layer,lambda x,y,c:y>=32+HEAD_DROP)
    front = keep(layer,lambda x,y,c:y<40+HEAD_DROP)
    save(f'hair-back/{n}',back,'V21 hair sheet reused; rear hair before clothing/head; same 3px correction as head')
    save(f'hair/{n}',front,'V21 hair sheet reused; forelocks above head, no neck overlay; same 3px correction as head')

# Semantic front flaps are calibrated on the complete source figures. Do not
# mistake a horizontal crop below the waist for a garment ownership mask.
front_flaps={
    'warrior':[
        [[(49,78),(62,78),(62,84),(59,94),(49,94),(45,92)],
         [(65,78),(73,78),(79,91),(77,94),(65,93)]],
        [[(49,78),(74,78),(78,93),(47,93)]],
        [[(49,78),(74,78),(79,94),(47,95)]],
        [[(50,78),(62,78),(62,84),(58,98),(47,97),(44,94)],
         [(65,78),(73,78),(79,94),(77,97),(66,98),(64,84)]]],
    'rogue':[
        [[(49,78),(57,78),(53,83),(47,85)],[(69,78),(73,78),(77,85),(73,84)]],
        [[(46,72),(54,72),(54,85),(45,85)],[(54,78),(74,78),(74,79),(54,79)]],
        [[(49,78),(73,78),(77,84),(69,82),(66,80),(61,83),(56,82),(48,84)]],
        [[(50,78),(61,78),(59,83),(47,88)],[(65,78),(71,78),(78,86),(75,88),(65,82)]]],
}
back_flaps={
    'warrior':[
        [[(49,79),(45,87),(44,92),(47,94),(51,88)]],[],[],
        [[(49,79),(44,90),(44,95),(48,96),(52,87)]]],
    'rogue':[
        [[(50,79),(46,85),(48,85),(53,80)]],[],[],
        [[(50,79),(46,86),(47,88),(52,82)]]],
}
for job in ('warrior','rogue'):
    for n in range(4):
        im = full[(job,n)]
        front_mask=polygon_mask(front_flaps[job][n])
        back_mask=polygon_mask(back_flaps[job][n])
        arms=Image.new('L',SIZE)
        ad=ImageDraw.Draw(arms)
        for y in range(78,110):
            for left,right in row_runs(im,y):
                if (left+right)/2<42 or (left+right)/2>80:
                    ad.line((left,y,right,y),fill=255)
        torso = keep(im,lambda x,y,c:41<=y and
                     (y<78 or front_mask.getpixel((x,y)) or arms.getpixel((x,y))))
        torso=clear_original_neck(torso,job,n)
        rear = keep(im,lambda x,y,c:bool(back_mask.getpixel((x,y))))
        lower = Image.new('RGBA',SIZE)
        for y in range(100,192):
            for left,right in row_runs(im,y):
                if y>=110 or 42<=(left+right)/2<=80:
                    for x in range(left,right+1):lower.putpixel((x,y),im.getpixel((x,y)))
        # Recover the hidden upper trousers using ONLY trouser pixels below the
        # crotch. Source shirts/arms can never be copied into this region.
        for y in range(77,100):
            t=(y-77)/23
            left,right=round(50-7*t),round(74+5*t)
            sy=103+(y-77)%5
            runs=[(a,b) for a,b in row_runs(im,sy) if 42<=(a+b)/2<=80]
            sample_x=[x for a,b in runs for x in range(a,b+1)]
            for x in range(left,right+1):
                if y>=98 and x==61:continue
                sx=sample_x[round((x-left)/max(1,right-left)*(len(sample_x)-1))]
                lower.putpixel((x,y),im.getpixel((sx,sy)))
        save(f'{job}/back-{n}',rear,f'Maker v23 {job} cell {n}; owned rear flaps behind trousers')
        save(f'{job}/torso-{n}',torso,f'Maker v23 {job} cell {n}; semantic shirt/arms mask, no old pants/neck')
        save(f'{job}/legs-{n}',lower,f'Maker v23 {job} cell {n}; trouser-only hip recovery and central leg runs, no clothes/arms')

# Long robes retain every pixel from collar to hem on ONE garment layer.
# Lower garments contain trousers and boots only, never another robe skirt.
for n in range(4):
    im = full[('mage',n)]
    robe = keep(im,lambda x,y,c:41<=y<155)
    robe=clear_original_neck(robe,'mage',n)
    robe = keep(robe,lambda x,y,c:not(108<=y<155 and 59<=x<=68 and max(c[:3])<58))
    under = parts[f'rogue/legs-{n}'].copy()
    under.putdata([(max(8,round(r*.18)),max(12,round(g*.25)),max(15,round(b*.32)),a)
                   if a else (0,0,0,0) for r,g,b,a in under.getdata()])
    under = keep(under,lambda x,y,c:y<155)
    boots = keep(im,lambda x,y,c:y>=154)
    under.alpha_composite(boots)
    save(f'mage/back-{n}',Image.new('RGBA',SIZE),'No rear accessory in this complete robe; reserved owned rear layer')
    save(f'mage/torso-{n}',robe,f'Maker v23 mage whole-body sheet cell {n}; intact collar-to-hem robe, slit transparent')
    save(f'mage/legs-{n}',under,f'Maker v23 mage boots cell {n}; dark trousers under intact robe, no skirt')

manifest = {
    'version':4,'appearanceIdVersion':1,'canvas':list(SIZE),
    'order':['hair-back','outfit-back','legs','head','torso','hair'],
    'headCount':4,'hairCount':8,'torsoCount':4,'legsCount':4,
    'source':'TapTap Maker v23, 2026-10-19, 3 complete-body sheets based on v22; clear v21 faces/hair reused',
    'sourceSheets':[f'{p}-原图.png' for p in JOBS],
    'baseline':'v22 complete body: collar(62.5,43), waist(62.5,78), floor182',
    'neckY':43,'waistY':78,'floorY':182,
    'headDropY':HEAD_DROP,
    'neckTreatment':'retain native jaw/root shadows; six-pixel shaded transition to source chest lighting; no flat-color extension',
    'neckOpeningMasks':NECK_OPENINGS,
    'ownership':{'hair':'no skin, ears, jaw outlines or neck',
                 'heads':'one owned neck, rendered behind collars',
                 'outfit-back':'belongs to torso ID, drawn behind lower garments',
                 'legs':'no shirt/flaps/arms; upper hip restored from pants-only rows'},
    'longRobe':{'profession':'mage','garmentSlot':'torso','hemY':155,'underlyingSlot':'legs',
                'rule':'one robe covers underlying trousers; boots remain visible; no waist split'},
    'layers':list(parts),'provenance':sources,
}
(STAGED/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def compose(job,gender,hair,head,torso,legs):
    out = Image.new('RGBA',SIZE)
    for name in (f'hair-back/{hair}',f'{job}/back-{torso}',f'{job}/legs-{legs}',
                 f'heads/{gender}-{head}',f'{job}/torso-{torso}',f'hair/{hair}'):
        out.alpha_composite(parts[name])
    return out

font = lambda px: ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',px)
names={'warrior':'战士','mage':'法师','rogue':'盗贼'}
review = Image.new('RGB',(1024,840),'#20363b')
d=ImageDraw.Draw(review)
d.text((22,16),'完整人体基准 · 三职业随机组合',font=font(25),fill='#f0ddbc')
for row,job in enumerate(JOBS):
    for n in range(8):
        gender='male' if n<4 else 'female'
        im=compose(job,gender,n,n%4,n%4,(n+2)%4)
        review.paste(im,(n*128,row*252+68),im)
        d.text((n*128+10,row*252+259),f'{names[job]} {"男" if gender=="male" else "女"} · {n%4+1}',font=font(13),fill='#c6d8d4')
review.save(REVIEW/'三职业随机人物-组合预览.png',optimize=True)

# Review EVERY torso/lower combination for each class, including all 16 robe
# versus boot combinations; gender/hair vary across columns for skin/ear QA.
for job in JOBS:
    check=Image.new('RGB',(768,992),'#20363b')
    d=ImageDraw.Draw(check)
    d.text((18,12),names[job]+' · 4衣物 × 4下装交叉检查',font=font(22),fill='#f0ddbc')
    for torso in range(4):
        for legs in range(4):
            n=torso*4+legs
            gender='female' if legs%2 else 'male'
            h=legs+(4 if gender=='female' else 0)
            im=compose(job,gender,h,torso,torso,legs).resize((160,240),Image.Resampling.NEAREST)
            check.paste(im,(legs*192+16,torso*234+47),im)
            d.text((legs*192+19,torso*234+47),f'{torso+1} / {legs+1}',font=font(13),fill='#9fc6c7')
    check.save(REVIEW/f'{job}-衣物下装交叉验收.png',optimize=True)

# Verify all 1536 legal default combinations geometrically, then visually
# inspect the contact sheets as a separate check. Pixels alone do not prove art.
checked=0
for job in JOBS:
    for gender in ('male','female'):
        for head in range(4):
            for h in range(4):
                hair=h+(4 if gender=='female' else 0)
                for torso in range(4):
                    for legs in range(4):
                        im=compose(job,gender,hair,head,torso,legs)
                        b=im.getbbox()
                        assert b and 0<b[0]<b[2]<128 and 0<b[1]<b[3]<192
                        checked+=1
if install:
    backup = ROOT/'art-direction/characters-v21/legacy-parts'
    if not backup.exists():
        shutil.copytree(TARGET,backup)
    for path in STAGED.rglob('*'):
        if path.is_file():
            destination=TARGET/path.relative_to(STAGED)
            destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(path,destination)
print(f'Prepared {len(parts)} parts; checked {checked} legal combinations; installed={install}')
