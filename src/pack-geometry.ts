export const PACK_CELL = 45,
  PACK_GAP = 2,
  PACK_PITCH = PACK_CELL + PACK_GAP;
export const PACK_WIDTH = 7 * PACK_PITCH - PACK_GAP,
  PACK_HEIGHT = 6 * PACK_PITCH - PACK_GAP;
export const shapeSize = (count: number) => count * PACK_PITCH - PACK_GAP;
export function pieceStyle(x: number, y: number, w: number, h: number) {
  return `left:${((x * PACK_PITCH) / PACK_WIDTH) * 100}%;top:${((y * PACK_PITCH) / PACK_HEIGHT) * 100}%;width:${(shapeSize(w) / PACK_WIDTH) * 100}%;height:${(shapeSize(h) / PACK_HEIGHT) * 100}%`;
}
export function packPoint(x: number, y: number) {
  if (
    x < 0 ||
    y < 0 ||
    x >= PACK_WIDTH ||
    y >= PACK_HEIGHT ||
    x % PACK_PITCH >= PACK_CELL ||
    y % PACK_PITCH >= PACK_CELL
  )
    return null;
  return { x: Math.floor(x / PACK_PITCH), y: Math.floor(y / PACK_PITCH) };
}
