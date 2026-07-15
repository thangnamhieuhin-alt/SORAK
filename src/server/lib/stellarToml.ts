import { parse as parseToml } from 'toml';
import { AppError } from '@/server/lib/http';

/**
 * Minimal `stellar.toml` shape. Anchors can publish more fields; we only
 * model the ones we read. The spec (SEP-1) is the canonical reference.
 *
 * Reference: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md
 */
export type StellarToml = {
  NETWORK_PASSPHRASE?: string;
  HORIZON_URL?: string;
  TRANSFER_SERVER?: string;
  TRANSFER_SERVER_SEP0024?: string;
  WEB_AUTH_ENDPOINT?: string;
  KYC_SERVER?: string;
  ANCHOR_QUOTE_SERVER?: string;
  SIGNING_KEY?: string;
  CURRENCIES?: Array<{
    code: string;
    issuer: string;
    status?: 'live' | 'test' | 'disabled';
    is_asset_anchored?: boolean;
    anchor_asset_type?: string;
    anchor_asset?: string;
    decimals?: number;
  }>;
  [key: string]: unknown;
};

const TOML_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type CachedEntry = { value: StellarToml; fetchedAt: number };
const cache = new Map<string, CachedEntry>();

function toHttps(domain: string): string {
  return domain.startsWith('http') ? domain : `https://${domain}`;
}

/**
 * Fetches and parses `/.well-known/stellar.toml` for the given domain.
 * Cached in-process for 1h. Throws `AppError` on any non-2xx or parse failure.
 */
export async function fetchStellarToml(domain: string): Promise<StellarToml> {
  const cached = cache.get(domain);
  if (cached && Date.now() - cached.fetchedAt < TOML_CACHE_TTL_MS) {
    return cached.value;
  }

  const url = `${toHttps(domain).replace(/\/$/, '')}/.well-known/stellar.toml`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'text/plain, application/toml' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError(
      'INTERNAL',
      `Failed to fetch stellar.toml from ${domain}: ${String(err)}`,
      502,
    );
  }
  if (!res.ok) {
    throw new AppError('INTERNAL', `stellar.toml fetch returned ${res.status} for ${domain}`, 502);
  }
  const text = await res.text();
  let parsed: StellarToml;
  try {
    parsed = parseToml(text) as StellarToml;
  } catch (err) {
    throw new AppError('INTERNAL', `stellar.toml parse failed for ${domain}: ${String(err)}`, 502);
  }
  cache.set(domain, { value: parsed, fetchedAt: Date.now() });
  return parsed;
}

export function clearStellarTomlCache(): void {
  cache.clear();
}
