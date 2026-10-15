import Decimal from 'break_infinity.js';
export type Amount = string | number;
export const D = (value: Amount | Decimal) => new Decimal(value);
export const add = (a: Amount, b: Amount): string => D(a).add(b).toString();
export const sub = (a: Amount, b: Amount): string => D(a).sub(b).max(0).toString();
export const mul = (a: Amount, b: Amount): string => D(a).mul(b).toString();
export const div = (a: Amount, b: Amount): string => D(a).div(b).toString();
export const pow = (a: Amount, b: number): string => D(a).pow(b).toString();
export const min = (a: Amount, b: Amount): string => D(a).min(b).toString();
export const round = (a: Amount): string => D(a).round().toString();
export const floor = (a: Amount): string => D(a).floor().toString();
export const gte = (a: Amount, b: Amount) => D(a).gte(b);
export const gt = (a: Amount, b: Amount) => D(a).gt(b);
export const ratio = (a: Amount, b: Amount) =>
  D(b).gt(0) ? Math.min(1, Math.max(0, D(a).div(b).toNumber())) : 0;
export function format(value: Amount, precision = 1) {
  const n = D(value);
  if (!Number.isFinite(n.mantissa) || !Number.isFinite(n.exponent)) return '—';
  if (n.exponent >= 15) return `${n.mantissa.toFixed(2)}e${n.exponent}`;
  for (const [exp, suffix] of [
    [12, 'T'],
    [9, 'B'],
    [6, 'M'],
    [3, 'K'],
  ] as const) {
    if (n.exponent >= exp)
      return `${n.div(Decimal.pow(10, exp)).toNumber().toFixed(precision)}${suffix}`;
  }
  return n.floor().toNumber().toLocaleString('en-US');
}
export function validAmount(value: unknown) {
  if (!(
    typeof value === 'number' ||
    (typeof value === 'string' &&
      value.length < 80 &&
      /^\+?\d+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(value))
  ))
    return false;
  try {
    const n = D(value);
    return Number.isFinite(n.mantissa) && Number.isFinite(n.exponent) && n.gte(0);
  } catch {
    return false;
  }
}
