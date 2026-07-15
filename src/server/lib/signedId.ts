import { createHmac, timingSafeEqual } from 'node:crypto';
import { SIGNED_ID_SECRET_VALUE } from '@/server/config/env';

const SEP = '.';
const VERSION = 'v1';

function toB64Url(buf: Buffer): string {
  return buf.toString('base64url');
}

function fromB64Url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

function key(): Buffer {
  return Buffer.from(SIGNED_ID_SECRET_VALUE, 'utf8');
}

/**
 * Signs a server-issued id with HMAC-SHA256. The format is
 *   `v1.<base64url(id)>.<base64url(HMAC-SHA256(id))>`
 *
 * The id can be embedded in a QR code that a public route verifies with
 * `verifyInvoiceId`. Without the secret the tag cannot be forged, so an
 * attacker cannot make a customer checkout page resolve an arbitrary row.
 */
export function signInvoiceId(id: string): string {
  const idPart = toB64Url(Buffer.from(id, 'utf8'));
  const sig = createHmac('sha256', key()).update(id).digest();
  return `${VERSION}${SEP}${idPart}${SEP}${toB64Url(sig)}`;
}

export function verifyInvoiceId(signed: string): { id: string } | null {
  if (typeof signed !== 'string' || !signed.startsWith(`${VERSION}${SEP}`)) {
    return null;
  }
  const rest = signed.slice(VERSION.length + SEP.length);
  const [idPart, sigPart] = rest.split(SEP, 2);
  if (!idPart || !sigPart) return null;
  let id: string;
  let provided: Buffer;
  try {
    id = fromB64Url(idPart).toString('utf8');
    provided = fromB64Url(sigPart);
  } catch {
    return null;
  }
  const expected = createHmac('sha256', key()).update(id).digest();
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  return { id };
}
