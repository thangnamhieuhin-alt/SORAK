import {
  Account,
  Asset,
  BASE_FEE,
  Claimant,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { env } from '@/server/config/env';
import { AppError } from '@/server/lib/http';
import { loadAccountSequence } from './account';
import { getClaimableBalanceIdFromTx } from './claimable';
import { getNetworkPassphrase, usdcAsset } from './network';
import { submitTransaction } from './xdr';

const DEFAULT_TIMEOUT_SEC = 300;

function issuerKeypair(): Keypair {
  if (!env.PLATFORM_ISSUER_SECRET) {
    throw new AppError('INTERNAL', 'PLATFORM_ISSUER_SECRET is not configured', 500);
  }
  return Keypair.fromSecret(env.PLATFORM_ISSUER_SECRET);
}

export function badgeIssuerPublicKey(): string {
  return issuerKeypair().publicKey();
}

export function badgeAsset(code: string): Asset {
  return new Asset(code, badgeIssuerPublicKey());
}

export type MintBadgeInput = {
  recipientPublicKey: string;
  assetCode: string;
  creatorHandle: string;
};

export type MintBadgeResult = {
  txHash: string;
  balanceId: string | null;
  issuerPublicKey: string;
};

/**
 * Mint a fan-badge asset and send it on-chain instantly. The platform issuer
 * creates a claimable balance of the badge asset for the fan — a single
 * issuer-signed transaction, no pre-existing trustline required on the fan's
 * side. This is the milestone wow moment: asset minted + sent in one tx.
 */
export async function mintBadgeToFan(input: MintBadgeInput): Promise<MintBadgeResult> {
  const issuer = issuerKeypair();
  const sequence = await loadAccountSequence(issuer.publicKey());
  const account = new Account(issuer.publicKey(), sequence);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      Operation.createClaimableBalance({
        asset: badgeAsset(input.assetCode),
        amount: '1',
        claimants: [
          new Claimant(input.recipientPublicKey, Claimant.predicateUnconditional()),
        ],
      }),
    )
    .addMemo(Memo.text(`sorak:${input.creatorHandle}`.slice(0, 28)))
    .setTimeout(DEFAULT_TIMEOUT_SEC)
    .build();
  tx.sign(issuer);
  const { hash } = await submitTransaction(tx.toXDR());
  const balanceId = await getClaimableBalanceIdFromTx(hash).catch(() => null);
  return { txHash: hash, balanceId, issuerPublicKey: issuer.publicKey() };
}

export type SponsoredTrustlineInput = {
  creatorPublicKey: string;
};

/**
 * Build a platform-sponsored USDC trustline transaction (CAP-33). The platform
 * is the source and pays the fee + the trustline reserve, so a creator with
 * zero XLM can accept USDC tips directly. Returns an XDR already signed by the
 * platform; the creator counter-signs in their wallet and submits.
 */
export async function buildSponsoredUsdcTrustlineXdr(
  input: SponsoredTrustlineInput,
): Promise<string> {
  const issuer = issuerKeypair();
  const sequence = await loadAccountSequence(issuer.publicKey());
  const account = new Account(issuer.publicKey(), sequence);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: input.creatorPublicKey,
      }),
    )
    .addOperation(Operation.changeTrust({ asset: usdcAsset(), source: input.creatorPublicKey }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: input.creatorPublicKey }))
    .setTimeout(DEFAULT_TIMEOUT_SEC)
    .build();
  tx.sign(issuer);
  return tx.toXDR();
}
