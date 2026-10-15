from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
for source,dest,width in [('art-direction/pixel-v17-guild/sources/guild-home-original.png','src/assets/guild-home.png',520),('art-direction/pixel-v7/assets/ruins.png','src/assets/ruins-ui.png',780)]:
 im=Image.open(root/source).convert('RGB');im=im.resize((width,round(im.height*width/im.width)),Image.Resampling.NEAREST);im=im.quantize(colors=160,method=Image.Quantize.MEDIANCUT);im.save(root/dest,optimize=True)
 print(dest,(root/dest).stat().st_size)
