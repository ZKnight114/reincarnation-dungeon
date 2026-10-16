"""Reserve badge space without changing footprints. Preserve all original sprites."""
import json
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
catalogue = json.loads((root / 'qa/v15.2-20261016/item-catalogue.json').read_text(encoding='utf-8-sig'))
backup = root / 'art-direction/pixel-v9/badge-update/originals'
backup.mkdir(parents=True, exist_ok=True)
report = []

for key, entry in catalogue.items():
    file = root / 'src/assets' / (entry['sprite'] + '.png')
    if not file.exists():
        continue
    original_file = backup / file.name
    # Re-running uses the original input rather than successively shrinking the art.
    img = Image.open(original_file if original_file.exists() else file).convert('RGBA')
    width, height = img.size
    cells = set(tuple(p) for p in entry['cells'])
    cols = max(p[0] for p in cells) + 1
    rows = max(p[1] for p in cells) + 1
    unit_x, unit_y = width / cols, height / rows
    anchor = entry['cells'][0]
    box = (round((anchor[0] + .06) * unit_x), round((anchor[1] + .06) * unit_y), round((anchor[0] + .59) * unit_x), round((anchor[1] + .34) * unit_y))

    def coverage(candidate):
        return sum(a > 0 for a in candidate.getchannel('A').crop(box).getdata())

    def outside(candidate):
        return sum(1 for y in range(height) for x in range(width) if candidate.getpixel((x, y))[3] > 0 and (int(x / unit_x), int(y / unit_y)) not in cells)

    options = [('unchanged', img)]
    # Mirrors are safe only for fully rectangular footprints.
    if len(cells) == cols * rows:
        options.append(('horizontal mirror', ImageOps.mirror(img)))
    if rows > 1 and len(cells) > 1:
        small = img.resize((round(width * .9), round(height * .9)), Image.Resampling.NEAREST)
        canvas = Image.new('RGBA', img.size)
        canvas.alpha_composite(small, ((width - small.width) // 2, height - small.height - 2))
        options.append(('90% art with upper clearance', canvas))
    allowed = [(label, candidate) for label, candidate in options if outside(candidate) <= outside(img)]
    label, best = min(allowed, key=lambda item: coverage(item[1]))
    if coverage(img) - coverage(best) < 6:
        label, best = 'unchanged', img
    if label != 'unchanged':
        if not original_file.exists():
            original_file.write_bytes(file.read_bytes())
        best.save(file, optimize=True)
    report.append({'id': key, 'sprite': file.name, 'action': label, 'badge_overlap_before': coverage(img), 'badge_overlap_after': coverage(best), 'pixels_outside_footprint': outside(best)})

(root / 'qa/v15.2-20261016/item-badge-adjustments.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps([r for r in report if r['action'] != 'unchanged'], ensure_ascii=False))
