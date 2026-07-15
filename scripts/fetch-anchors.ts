import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import toml from '@iarna/toml';

const DIRECTORY_API = 'https://api.stellar.expert/explorer/directory';
const PAGE_SIZE = 200;
const TOML_TIMEOUT_MS = 10_000;
const TOML_CONCURRENCY = 8;
const USER_AGENT = 'stellar-anchor-snapshot/1.0 (+https://stellar.org)';

type DirectoryRecord = {
  address: string;
  domain: string;
  name: string;
  tags: string[];
};

type DirectoryResponse = {
  _embedded?: { records?: DirectoryRecord[] };
  _links?: { next?: { href?: string | null } };
};

type Sep1Doc = {
  VERSION?: string;
  NETWORK_PASSPHRASE?: string;
  FEDERATION_SERVER?: string;
  AUTH_SERVER?: string;
  TRANSFER_SERVER?: string;
  TRANSFER_SERVER_SEP0024?: string;
  KYC_SERVER?: string;
  WEB_AUTH_ENDPOINT?: string;
  WEB_AUTH_FOR_CONTRACTS_ENDPOINT?: string;
  WEB_AUTH_CONTRACT_ID?: string;
  SIGNING_KEY?: string;
  HORIZON_URL?: string;
  ACCOUNTS?: string[];
  URI_REQUEST_SIGNING_KEY?: string;
  DIRECT_PAYMENT_SERVER?: string;
  ANCHOR_QUOTE_SERVER?: string;
  DOCUMENTATION?: Record<string, string | number | boolean>;
  PRINCIPALS?: Array<Record<string, string>>;
  CURRENCIES?: Array<Record<string, unknown>>;
  VALIDATORS?: Array<Record<string, string>>;
};

type FetchResult =
  | { status: 'ok'; toml: Sep1Doc }
  | { status: 'http-error'; httpStatus: number; reason: string }
  | { status: 'parse-error'; reason: string }
  | { status: 'network-error'; reason: string };

type AnchorRow = {
  name: string;
  domain: string;
  address: string;
  tags: string[];
  toml: FetchResult;
};

const sepEndpoints: Array<[keyof Sep1Doc, string]> = [
  ['FEDERATION_SERVER', 'SEP-2 Federation'],
  ['AUTH_SERVER', 'SEP-3 Auth (deprecated)'],
  ['TRANSFER_SERVER', 'SEP-6 Deposit/Withdrawal'],
  ['TRANSFER_SERVER_SEP0024', 'SEP-24 Interactive Deposit/Withdrawal'],
  ['KYC_SERVER', 'SEP-12 KYC'],
  ['WEB_AUTH_ENDPOINT', 'SEP-10 Web Auth'],
  ['WEB_AUTH_FOR_CONTRACTS_ENDPOINT', 'SEP-45 Web Auth (Contracts)'],
  ['DIRECT_PAYMENT_SERVER', 'SEP-31 Cross-Border Payments'],
  ['ANCHOR_QUOTE_SERVER', 'SEP-38 Anchor Quotes'],
  ['HORIZON_URL', 'Public Horizon'],
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return (await res.json()) as T;
}

async function fetchAllAnchors(): Promise<DirectoryRecord[]> {
  const out: DirectoryRecord[] = [];
  let cursor: string | null = null;
  let page = 0;
  while (true) {
    const params = new URLSearchParams();
    params.set('tag[]', 'anchor');
    params.set('limit', String(PAGE_SIZE));
    if (cursor) {
      params.set('cursor', cursor);
    }
    const url = `${DIRECTORY_API}?${params.toString()}`;
    const data = await fetchJson<DirectoryResponse>(url);
    const records = data._embedded?.records ?? [];
    out.push(...records);
    page += 1;
    process.stdout.write(`  page ${page}: +${records.length} (total ${out.length})\n`);
    const nextHref = data._links?.next?.href;
    if (!nextHref || records.length === 0) {
      break;
    }
    const nextUrl = new URL(nextHref, `${DIRECTORY_API}/`);
    const nextCursor = nextUrl.searchParams.get('cursor');
    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }
  return out;
}

async function fetchToml(domain: string): Promise<FetchResult> {
  const url = `https://${domain}/.well-known/stellar.toml`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOML_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/plain, text/toml, */*',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { status: 'http-error', httpStatus: res.status, reason: res.statusText };
    }
    const text = await res.text();
    try {
      const parsed = toml.parse(text) as Sep1Doc;
      return { status: 'ok', toml: parsed };
    } catch (e) {
      return { status: 'parse-error', reason: (e as Error).message };
    }
  } catch (e) {
    return { status: 'network-error', reason: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllToml(rows: AnchorRow[]): Promise<void> {
  let index = 0;
  let done = 0;
  const total = rows.length;
  const workers = Array.from({ length: TOML_CONCURRENCY }, async () => {
    while (index < total) {
      const myIndex = index++;
      const row = rows[myIndex];
      row.toml = await fetchToml(row.domain);
      done += 1;
      const statusTag = `[${row.toml.status}]`.padEnd(16);
      process.stdout.write(`  toml ${done}/${total} ${statusTag} ${row.domain}\n`);
    }
  });
  await Promise.all(workers);
}

function escapeCell(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

function renderEndpoints(toml: Sep1Doc): string {
  const rows: string[] = [];
  for (const [key, label] of sepEndpoints) {
    const value = toml[key];
    if (typeof value === 'string' && value.length > 0) {
      rows.push(`- **${label}** — \`${value}\``);
    }
  }
  const webAuthContract = toml.WEB_AUTH_CONTRACT_ID;
  if (typeof webAuthContract === 'string' && webAuthContract.length > 0) {
    rows.push(`- **SEP-45 Web Auth Contract** — \`${webAuthContract}\``);
  }
  const signingKey = toml.SIGNING_KEY;
  if (typeof signingKey === 'string' && signingKey.length > 0) {
    rows.push(`- **Signing key** — \`${signingKey}\``);
  }
  const uriSigningKey = toml.URI_REQUEST_SIGNING_KEY;
  if (typeof uriSigningKey === 'string' && uriSigningKey.length > 0) {
    rows.push(`- **URI request signing key (SEP-7)** — \`${uriSigningKey}\``);
  }
  return rows.length > 0 ? rows.join('\n') : '_No service endpoints declared._';
}

function renderCurrencies(currencies: Sep1Doc['CURRENCIES']): string {
  if (!currencies || currencies.length === 0) {
    return '_No currencies declared in `stellar.toml`._';
  }
  const header = '| Code | Issuer | Status | Anchor type | Anchor asset | Decimals |';
  const sep = '| --- | --- | --- | --- | --- | --- |';
  const lines = [header, sep];
  for (const c of currencies) {
    const code = c.code !== undefined ? String(c.code) : '';
    const issuer = c.issuer !== undefined ? String(c.issuer) : '';
    const status = c.status !== undefined ? String(c.status) : '';
    const anchorType = c.anchor_asset_type !== undefined ? String(c.anchor_asset_type) : '';
    const anchorAsset = c.anchor_asset !== undefined ? String(c.anchor_asset) : '';
    const decimals = c.display_decimals !== undefined ? String(c.display_decimals) : '';
    const codeCell = code ? `**${code}**` : '_(no code)_';
    const issuerCell = issuer ? `\`${issuer}\`` : '_(no issuer)_';
    lines.push(
      `| ${codeCell} | ${issuerCell} | ${escapeCell(status) || '—'} | ${escapeCell(anchorType) || '—'} | ${escapeCell(anchorAsset) || '—'} | ${escapeCell(decimals) || '—'} |`,
    );
  }
  return lines.join('\n');
}

function renderAccounts(accounts: string[] | undefined): string {
  if (!accounts || accounts.length === 0) {
    return '_None._';
  }
  return accounts.map((a) => `- \`${a}\``).join('\n');
}

function renderDocumentation(doc: Sep1Doc['DOCUMENTATION']): string {
  if (!doc) {
    return '_No `[DOCUMENTATION]` block._';
  }
  const lines: string[] = [];
  for (const [key, value] of Object.entries(doc)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    const display = String(value);
    if (display.length > 0) {
      lines.push(`- **${key}** — ${truncate(display, 200)}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : '_No `[DOCUMENTATION]` block._';
}

function renderPrincipals(principals: Sep1Doc['PRINCIPALS']): string {
  if (!principals || principals.length === 0) {
    return '_No `[[PRINCIPALS]]` declared._';
  }
  return principals
    .map((p, i) => {
      const lines = Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `  - **${k}** — ${String(v)}`);
      return `**Principal ${i + 1}**\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

function renderAnchor(row: AnchorRow): string {
  const status =
    row.toml.status === 'ok'
      ? 'ok'
      : row.toml.status === 'http-error'
        ? `http ${row.toml.httpStatus}`
        : row.toml.status;
  const header = `## ${row.name} — \`${row.domain}\``;
  const meta = [
    `- **Directory account:** \`${row.address}\``,
    `- **Tags:** ${row.tags.length > 0 ? row.tags.map((t) => `\`${t}\``).join(', ') : '_(none)_'}`,
    `- **\`stellar.toml\` fetch:** ${status}${row.toml.status !== 'ok' ? ` — ${escapeCell(JSON.stringify(row.toml))}` : ''}`,
  ].join('\n');
  const sections: string[] = [header, meta];

  if (row.toml.status === 'ok') {
    const doc = row.toml.toml;
    const network = doc.NETWORK_PASSPHRASE ?? '_(unspecified)_';
    const version = doc.VERSION ?? '_(unspecified)_';
    sections.push('### Network & version');
    sections.push(`- **Network passphrase:** ${network}`);
    sections.push(`- **SEP-1 version:** ${version}`);
    sections.push('');
    sections.push('### Service endpoints');
    sections.push(renderEndpoints(doc));
    sections.push('');
    sections.push('### Organization documentation');
    sections.push(renderDocumentation(doc.DOCUMENTATION));
    sections.push('');
    sections.push('### Principals');
    sections.push(renderPrincipals(doc.PRINCIPALS));
    sections.push('');
    sections.push('### Currencies');
    sections.push(renderCurrencies(doc.CURRENCIES));
    sections.push('');
    sections.push('### Accounts');
    sections.push(renderAccounts(doc.ACCOUNTS));
  } else {
    sections.push('### `stellar.toml` could not be retrieved');
    sections.push(
      'The Stellar Expert directory lists this account with the `anchor` tag, but its `stellar.toml` could not be fetched or parsed.',
    );
  }
  return sections.join('\n\n');
}

function renderSummaryTable(rows: AnchorRow[]): string {
  const header = '| # | Name | Domain | Directory tags | `stellar.toml` | Endpoints | Currencies |';
  const sep = '| --- | --- | --- | --- | --- | --- | --- |';
  const lines: string[] = [header, sep];
  rows.forEach((row, i) => {
    const status =
      row.toml.status === 'ok'
        ? 'ok'
        : row.toml.status === 'http-error'
          ? `http ${row.toml.httpStatus}`
          : row.toml.status;
    let endpointCount = 0;
    let currencyCount = 0;
    if (row.toml.status === 'ok') {
      endpointCount = sepEndpoints.filter(([k]) => {
        const v = row.toml.toml[k];
        return typeof v === 'string' && v.length > 0;
      }).length;
      currencyCount = row.toml.toml.CURRENCIES?.length ?? 0;
    }
    lines.push(
      `| ${i + 1} | ${escapeCell(row.name)} | \`${escapeCell(row.domain)}\` | ${escapeCell(row.tags.join(', '))} | ${escapeCell(status)} | ${endpointCount} | ${currencyCount} |`,
    );
  });
  return lines.join('\n');
}

function renderMarkdown(rows: AnchorRow[]): string {
  const okCount = rows.filter((r) => r.toml.status === 'ok').length;
  const httpErr = rows.filter((r) => r.toml.status === 'http-error').length;
  const parseErr = rows.filter((r) => r.toml.status === 'parse-error').length;
  const netErr = rows.filter((r) => r.toml.status === 'network-error').length;
  const totalEndpoints = rows.reduce((acc, r) => {
    if (r.toml.status !== 'ok') {
      return acc;
    }
    return (
      acc +
      sepEndpoints.filter(([k]) => {
        const v = r.toml.toml[k];
        return typeof v === 'string' && v.length > 0;
      }).length
    );
  }, 0);
  const totalCurrencies = rows.reduce((acc, r) => {
    if (r.toml.status !== 'ok') {
      return acc;
    }
    return acc + (r.toml.toml.CURRENCIES?.length ?? 0);
  }, 0);

  const generatedAt = new Date().toISOString();
  const header = [
    '# Stellar Anchor Directory — snapshot',
    '',
    `_Generated ${generatedAt} from \`api.stellar.expert\` (tag: \`anchor\`) and per-anchor \`/.well-known/stellar.toml\` (SEP-1)._`,
    '',
    '## Coverage',
    '',
    `- **Anchors enumerated:** ${rows.length}`,
    `- **\`stellar.toml\` fetched successfully:** ${okCount}`,
    `- **HTTP errors (e.g. 404, 403):** ${httpErr}`,
    `- **Parse errors (malformed TOML):** ${parseErr}`,
    `- **Network errors (timeout, DNS, TLS):** ${netErr}`,
    `- **Service endpoints declared across all anchors:** ${totalEndpoints}`,
    `- **Currencies declared across all anchors:** ${totalCurrencies}`,
    '',
    "> **Source note.** The user-facing directory at `anchors.stellar.org` is a client-rendered SPA whose data ultimately comes from on-chain `home_domain` fields. This snapshot uses Stellar Expert's public REST API (`api.stellar.expert/explorer/directory?tag[]=anchor`) as the canonical anchor list, then enriches each entry with the SEP-1 `stellar.toml` it publishes. This avoids geo-restrictions that affect the SPA in some regions (e.g. NL) and produces a more comprehensive, structured report than the SPA alone.",
    '',
    '## Summary table',
    '',
    renderSummaryTable(rows),
    '',
    '---',
    '',
    '## Per-anchor detail',
    '',
  ].join('\n');

  const body = rows.map(renderAnchor).join('\n\n---\n\n');
  return `${header}${body}\n`;
}

async function main(): Promise<void> {
  const outPath = resolve(process.cwd(), 'docs/anchors.md');
  process.stdout.write('Step 1/3: enumerate anchors from Stellar Expert directory API\n');
  const records = await fetchAllAnchors();
  process.stdout.write(`  -> ${records.length} anchors discovered\n\n`);

  const dedup = new Map<string, DirectoryRecord>();
  for (const r of records) {
    if (!r.domain || !r.address) {
      continue;
    }
    if (!dedup.has(r.domain)) {
      dedup.set(r.domain, r);
    }
  }
  const rows: AnchorRow[] = Array.from(dedup.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({
      name: r.name || r.domain,
      domain: r.domain,
      address: r.address,
      tags: r.tags ?? [],
      toml: { status: 'network-error', reason: 'not fetched' } as FetchResult,
    }));

  process.stdout.write(
    `Step 2/3: fetch stellar.toml for ${rows.length} unique domains (concurrency ${TOML_CONCURRENCY}, timeout ${TOML_TIMEOUT_MS}ms)\n`,
  );
  await fetchAllToml(rows);
  process.stdout.write('\n');

  process.stdout.write(`Step 3/3: render markdown to ${outPath}\n`);
  const markdown = renderMarkdown(rows);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, markdown, 'utf8');
  process.stdout.write(`  -> wrote ${markdown.length} bytes\n`);

  const okCount = rows.filter((r) => r.toml.status === 'ok').length;
  process.stdout.write(`\nDone. ${okCount}/${rows.length} anchors have a parsed stellar.toml.\n`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
