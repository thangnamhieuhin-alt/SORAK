/**
 * Helpers for handling minor-unit amounts as text. USDC on Stellar has 6 decimals,
 * so $1.00 is "1000000" and $20.00 is "20000000". We store and serialize as
 * `text` because BigInt does not survive `JSON.stringify` and `Number` loses
 * precision above 2^53.
 *
 * Rules (enforced by these helpers):
 *   - All public APIs accept/return `string` (digits only, no sign, no decimal).
 *   - Internal arithmetic uses `bigint` only.
 *   - Any parse failure throws `AppError('INVALID_INPUT', ...)`.
 */

import { AppError } from './http';

const MINOR_RE = /^[0-9]+$/;

function assertMinorString(value: string, fieldName: string): void {
  if (typeof value !== 'string' || !MINOR_RE.test(value) || value.length === 0) {
    throw new AppError(
      'INVALID_INPUT',
      `${fieldName} must be a non-negative integer string (minor units)`,
      400,
    );
  }
}

export function minorFromString(value: string, fieldName = 'amount'): bigint {
  assertMinorString(value, fieldName);
  return BigInt(value);
}

export function minorToString(value: bigint): string {
  return value.toString();
}

export function isMinorString(value: unknown): value is string {
  return typeof value === 'string' && MINOR_RE.test(value) && value.length > 0;
}

export function addMinor(a: string, b: string): string {
  return (minorFromString(a) + minorFromString(b)).toString();
}

export function subtractMinor(a: string, b: string): string {
  const result = minorFromString(a) - minorFromString(b);
  if (result < 0n) {
    throw new AppError('INVALID_INPUT', 'subtractMinor underflow', 400);
  }
  return result.toString();
}

export function compareMinor(a: string, b: string): -1 | 0 | 1 {
  const left = minorFromString(a);
  const right = minorFromString(b);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Formats a minor-unit string using the asset's decimals. Default 6 (USDC on Stellar).
 * Returns a localized human-readable string. Use when rendering to UI only — never
 * persist the result.
 */
export function formatMinor(
  value: string,
  opts: { decimals?: number; symbol?: string; locale?: string } = {},
): string {
  const decimals = opts.decimals ?? 6;
  const symbol = opts.symbol ?? '';
  const locale = opts.locale ?? 'en-US';
  const big = minorFromString(value);
  const negative = big < 0n;
  const abs = negative ? -big : big;
  const padded = abs.toString().padStart(decimals, '0');
  const whole = padded.slice(0, padded.length - decimals) || '0';
  const fraction = decimals > 0 ? padded.slice(padded.length - decimals) : '';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(`${whole}.${fraction || '0'}`));
  return `${negative ? '-' : ''}${symbol}${formatted}`;
}
