import { z } from 'zod';

const publicEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Stellar Starter'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SUPPORTED_LOCALES: z.string().default('en,vi'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default('en'),
  NEXT_PUBLIC_LOCALE_PREFIX: z.enum(['always', 'as-needed', 'never']).default('as-needed'),
  NEXT_PUBLIC_OFFRAMP_ANCHOR_DOMAIN: z.string().default('mock'),
  NEXT_PUBLIC_USDC_ASSET_CODE: z.string().default('USDC'),
  NEXT_PUBLIC_STELLAR_NETWORK: z.enum(['testnet', 'public', 'futurenet']).default('public'),
  NEXT_PUBLIC_DEMO_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  NEXT_PUBLIC_BASE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  NEXT_PUBLIC_HUB_EVM_ADDRESS: z.string().default(''),
  NEXT_PUBLIC_BASE_USDC_CONTRACT: z.string().default('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  NEXT_PUBLIC_REPO_URL: z.string().url().default('https://github.com/'),
});

const parsed = publicEnvSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPPORTED_LOCALES: process.env.NEXT_PUBLIC_SUPPORTED_LOCALES,
  NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  NEXT_PUBLIC_LOCALE_PREFIX: process.env.NEXT_PUBLIC_LOCALE_PREFIX,
  NEXT_PUBLIC_OFFRAMP_ANCHOR_DOMAIN: process.env.NEXT_PUBLIC_OFFRAMP_ANCHOR_DOMAIN,
  NEXT_PUBLIC_USDC_ASSET_CODE: process.env.NEXT_PUBLIC_USDC_ASSET_CODE,
  NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_BASE_ENABLED: process.env.NEXT_PUBLIC_BASE_ENABLED,
  NEXT_PUBLIC_HUB_EVM_ADDRESS: process.env.NEXT_PUBLIC_HUB_EVM_ADDRESS,
  NEXT_PUBLIC_BASE_USDC_CONTRACT: process.env.NEXT_PUBLIC_BASE_USDC_CONTRACT,
  NEXT_PUBLIC_REPO_URL: process.env.NEXT_PUBLIC_REPO_URL,
});

if (!parsed.success) {
  throw new Error('Invalid public environment variables');
}

export const publicEnv = parsed.data;
export type PublicEnv = typeof publicEnv;
