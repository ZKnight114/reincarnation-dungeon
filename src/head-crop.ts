export type HeadRegion = [number, number, number, number];

/** Alpha trim within an art-specific face window, then fit without stretching. */
export function cropHeadImage(source: HTMLImageElement | HTMLCanvasElement, region: HeadRegion) {
  const [x, y, width, height] = region.map(Math.round),
    crop = document.createElement('canvas');
  crop.width = Math.max(1, width);
  crop.height = Math.max(1, height);
  const ctx = crop.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, width, height, 0, 0, crop.width, crop.height);
  const data = ctx.getImageData(0, 0, crop.width, crop.height).data;
  let left = crop.width,
    top = crop.height,
    right = 0,
    bottom = 0;
  for (let py = 0; py < crop.height; py++)
    for (let px = 0; px < crop.width; px++)
      if (data[(py * crop.width + px) * 4 + 3] > 32) {
        left = Math.min(left, px);
        top = Math.min(top, py);
        right = Math.max(right, px + 1);
        bottom = Math.max(bottom, py + 1);
      }
  if (right <= left || bottom <= top) return null;
  const output = document.createElement('canvas');
  output.width = output.height = 96;
  const paint = output.getContext('2d');
  if (!paint) return null;
  paint.imageSmoothingEnabled = false;
  const w = right - left,
    h = bottom - top,
    scale = 92 / Math.max(w, h);
  paint.drawImage(
    crop,
    left,
    top,
    w,
    h,
    (96 - w * scale) / 2,
    (96 - h * scale) / 2,
    w * scale,
    h * scale,
  );
  return output.toDataURL('image/png');
}
