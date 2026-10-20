/** Keep art and square backpack cells proportional; phone scenery fills the viewport. */
export function viewportFit(width: number, height: number) {
  const mobile = width <= 600 && height > width;
  const scale = Math.min(width / 390, height / 844, mobile ? Infinity : 1.15);
  return {
    mobile,
    scale,
    contentWidth: 390 * scale,
    contentHeight: 844 * scale,
    frameWidth: mobile ? width : 390 * scale,
    frameHeight: mobile ? height : 844 * scale,
  };
}
