/** Invoice money is integer minor units (cents). Quantities are decimal strings. */

export const QUANTITY_SCALE = 3;
export const MAX_QUANTITY_MILLI = 10_000 * 1000;
export const MAX_RATE_MINOR = 1_000_000_00;
export const MAX_LINES = 40;

const QUANTITY_PATTERN = /^\d{1,5}(\.\d{1,3})?$/;

export function decimalToMilli(quantity: string): number {
  const trimmed = quantity.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) {
    throw new Error("Quantity must be a positive decimal with at most 3 places.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const milli = Number(whole) * 1000 + Number(frac.padEnd(QUANTITY_SCALE, "0"));
  if (!Number.isSafeInteger(milli) || milli <= 0 || milli > MAX_QUANTITY_MILLI) {
    throw new Error("Quantity is out of range.");
  }
  return milli;
}

export function isValidQuantity(quantity: string | null | undefined): quantity is string {
  if (!quantity) return false;
  try {
    decimalToMilli(quantity);
    return true;
  } catch {
    return false;
  }
}

/** Round half away from zero. Inputs are non-negative in this product. */
export function roundHalfAwayFromZero(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error("Invalid denominator.");
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const q = Math.floor(abs / denominator);
  const r = abs % denominator;
  const rounded = r * 2 >= denominator ? q + 1 : q;
  return sign * rounded;
}

/** Line amount in minor units. quantity * rate, rounded half away from zero to the cent. */
export function lineAmountMinor(quantity: string, rateMinor: number): number {
  if (!Number.isInteger(rateMinor) || rateMinor < 0 || rateMinor > MAX_RATE_MINOR) {
    throw new Error("Rate is out of range.");
  }
  const milli = decimalToMilli(quantity);
  return roundHalfAwayFromZero(milli * rateMinor, 1000);
}

export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${whole}.${cents.toString().padStart(2, "0")}`;
}

export function parseMoneyToMinor(value: string): number | null {
  const trimmed = value.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor > MAX_RATE_MINOR) return null;
  return minor;
}

export function sumMinor(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
