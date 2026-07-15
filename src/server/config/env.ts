import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  NEXT_PUBLIC_APP_NAME: z.string().default('Stellar Starter'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  DRIZZLE_DATABASE_URL: z.string().url(),

  STELLAR_NETWORK: z.enum(['testnet', 'public', 'futurenet']).default('public'),
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),

  /** Soroban RPC endpoint used to prepare/submit the milestone contract invoke. */
  SOROBAN_RPC_URL: z.string().url().default('https://soroban-rpc.creit.tech'),
  /** Deployed SorakMilestone contract id. When set, XLM tips route through record_tip. */
  SOROBAN_CONTRACT_ID: z.string().default(''),
  /** Stellar Asset Contract the milestone contract moves (testnet native XLM SAC). */
  SOROBAN_TOKEN_ID: z
    .string()
    .default('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  SESSION_COOKIE_NAME: z.string().default('stellar_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // --- Universal Merchant Payment Hub ---
  /** Secret used to HMAC-sign invoice signed IDs. Falls back to SESSION_SECRET if unset. */
  SIGNED_ID_SECRET: z.string().min(32).optional(),
  /** Secret used to sign the customer JWT (issued by /api/checkout/verify). Falls back to SIGNED_ID_SECRET. */
  CUSTOMER_JWT_SECRET: z.string().min(32).optional(),
  /** Default invoice expiry when the merchant does not specify one. */
  INVOICE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Cap on a single invoice amount, in minor units. */
  INVOICE_AMOUNT_MINOR_MAX: z.coerce.number().int().positive().default(10_000_000_000),
  /** Withdrawal expiry (after which status flips to 'expired'). */
  WITHDRAWAL_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  /** Default off-ramp anchor domain. Use 'mock' for the bundled mock anchor server. */
  OFFRAMP_ANCHOR_DOMAIN: z.string().default('mock'),
  /** Polling interval for off-ramp withdrawal status checks. */
  OFFRAMP_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  /** When true, use Horizon SSE stream for payment detection; otherwise poll only. */
  HORIZON_STREAM_ENABLED: z.coerce.boolean().default(true),
  /** Heartbeat interval for SSE connections. */
  SSE_HEARTBEAT_MS: z.coerce.number().int().positive().default(15_000),
  /** Max concurrent SSE streams per IP. */
  SSE_MAX_CONCURRENT_PER_IP: z.coerce.number().int().positive().default(20),
  /** Idempotency cache TTL for mutation routes. */
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  /** Mount simulate-* routes (only useful for demo / hackathon). */
  DEMO_MODE: z.coerce.boolean().default(false),

  // --- Sorak creator support platform ---
  /** Platform issuer secret. Signs fan-badge asset mints + sponsored trustline onboarding. Testnet only. */
  PLATFORM_ISSUER_SECRET: z.string().optional(),
  /** Prefix for fan-badge asset codes, e.g. "SRKB" -> SRKB1, SRKB2. */
  BADGE_ASSET_PREFIX: z.string().default('SRKB'),
  /** Minimum tip amount (display units). */
  TIP_MIN_AMOUNT: z.string().default('0.5'),
  /** Maximum tip amount (display units) — keeps demo amounts small. */
  TIP_MAX_AMOUNT: z.string().default('50'),

  // --- Base (EVM) bridge ---
  /** Enable Base Sepolia → Stellar USDC bridge. */
  BASE_ENABLED: z.coerce.boolean().default(false),
  /** Base Sepolia JSON-RPC URL. */
  BASE_RPC_URL: z.string().url().default('https://sepolia.base.org'),
  /** USDC contract address on Base Sepolia. */
  BASE_USDC_CONTRACT: z
    .string()
    .default('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  /** Hub's EVM address that receives USDC from customers on Base. */
  HUB_EVM_ADDRESS: z.string().optional(),
  /** Hub's Stellar secret key used to send USDC to merchants after bridge. */
  HUB_STELLAR_SECRET: z.string().optional(),
  /** How often to poll Base for new USDC transfers (ms). */
  BASE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(12_000),

  /** USDC asset configuration. */
  USDC_ASSET_CODE: z.string().default('USDC'),
  USDC_ASSET_ISSUER_TESTNET: z
    .string()
    .default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  USDC_ASSET_ISSUER_PUBLIC: z
    .string()
    .default('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),

  NEXT_PUBLIC_SUPPORTED_LOCALES: z.string().default('en,vi'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default('en'),
  NEXT_PUBLIC_LOCALE_PREFIX: z.enum(['always', 'as-needed', 'never']).default('as-needed'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

const rawEnv = parsed.data;

/**
 * Resolved at module load. Falls back to SESSION_SECRET with a warning.
 * Splitting the secret means rotating one does not invalidate the other.
 */
export const SIGNED_ID_SECRET_VALUE: string = (() => {
  if (rawEnv.SIGNED_ID_SECRET) return rawEnv.SIGNED_ID_SECRET;
  if (rawEnv.NODE_ENV === 'production') {
    console.warn(
      '[env] SIGNED_ID_SECRET is not set in production; falling back to SESSION_SECRET.',
    );
  }
  return rawEnv.SESSION_SECRET;
})();

/**
 * Resolved at module load. Used as the HS256 key for customer JWTs.
 * Splitting from SIGNED_ID_SECRET means rotating one does not invalidate
 * the other (signed IDs are long-lived, customer JWTs are 5 min).
 */
export const CUSTOMER_JWT_SECRET_VALUE: string = (() => {
  if (rawEnv.CUSTOMER_JWT_SECRET) return rawEnv.CUSTOMER_JWT_SECRET;
  if (rawEnv.NODE_ENV === 'production') {
    console.warn(
      '[env] CUSTOMER_JWT_SECRET is not set in production; falling back to SIGNED_ID_SECRET.',
    );
  }
  return SIGNED_ID_SECRET_VALUE;
})();

/**
 * Resolved USDC issuer for the active Stellar network.
 */
export const USDC_ASSET_ISSUER_VALUE: string = (() => {
  if (rawEnv.STELLAR_NETWORK === 'public') return rawEnv.USDC_ASSET_ISSUER_PUBLIC;
  if (rawEnv.STELLAR_NETWORK === 'futurenet') return rawEnv.USDC_ASSET_ISSUER_TESTNET;
  return rawEnv.USDC_ASSET_ISSUER_TESTNET;
})();

export const env = rawEnv;
export type Env = typeof env;
