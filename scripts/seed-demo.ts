import {
  Asset,
  BASE_FEE,
  Claimant,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { stellar } from '@/server/config/stellar';
import { env, USDC_ASSET_ISSUER_VALUE } from '@/server/config/env';
import { db } from '@/server/db/client';
import { creatorService } from '@/server/service/creator.service';
import { tipService } from '@/server/service/tip.service';
import { badgeIssuerPublicKey } from '@/server/stellar/assets';

const HORIZON = env.STELLAR_HORIZON_URL.replace(/\/$/, '');
const usdc = new Asset(env.USDC_ASSET_CODE, USDC_ASSET_ISSUER_VALUE);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function accountExists(pub: string): Promise<boolean> {
  const res = await fetch(`${HORIZON}/accounts/${pub}`);
  return res.ok;
}

async function fundIfNeeded(pub: string, label: string): Promise<void> {
  if (await accountExists(pub)) {
    console.log(`  [ok] ${label} already funded`);
    return;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${pub}`);
    if (res.ok) {
      console.log(`  [+] funded ${label}`);
      await sleep(1500);
      return;
    }
    await sleep(2500);
  }
  throw new Error(`friendbot failed for ${label}`);
}

async function loadSequence(pub: string): Promise<string> {
  const res = await fetch(`${HORIZON}/accounts/${pub}`);
  const data = (await res.json()) as { sequence: string };
  return data.sequence;
}

async function submit(xdr: string): Promise<string> {
  const res = await fetch(`${HORIZON}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tx: xdr }).toString(),
  });
  const data = (await res.json()) as { hash?: string; extras?: unknown };
  if (!data.hash) throw new Error(`submit failed: ${JSON.stringify(data.extras ?? data)}`);
  return data.hash;
}

async function buildSigned(sourceKp: Keypair, ops: (b: TransactionBuilder) => void): Promise<string> {
  const { Account } = await import('@stellar/stellar-sdk');
  const seq = await loadSequence(sourceKp.publicKey());
  const builder = new TransactionBuilder(new Account(sourceKp.publicKey(), seq), {
    fee: BASE_FEE,
    networkPassphrase: stellar.passphrase,
  });
  ops(builder);
  const tx = builder.setTimeout(120).build();
  tx.sign(sourceKp);
  return tx.toXDR();
}

async function sendXlmTip(fan: Keypair, dest: string, amount: string, handle: string): Promise<string> {
  const xdr = await buildSigned(fan, (b) => {
    b.addOperation(Operation.payment({ destination: dest, asset: Asset.native(), amount }));
    b.addMemo(Memo.text(`sorak:${handle}`.slice(0, 28)));
  });
  return submit(xdr);
}

async function sendClaimableTip(fan: Keypair, claimant: string, amount: string): Promise<string> {
  const xdr = await buildSigned(fan, (b) => {
    b.addOperation(
      Operation.createClaimableBalance({
        asset: Asset.native(),
        amount,
        claimants: [new Claimant(claimant, Claimant.predicateUnconditional())],
      }),
    );
  });
  return submit(xdr);
}

async function addUsdcTrustline(owner: Keypair): Promise<void> {
  const xdr = await buildSigned(owner, (b) => {
    b.addOperation(Operation.changeTrust({ asset: usdc }));
  });
  await submit(xdr);
}

const CREATORS = [
  {
    handle: 'ploydraws',
    displayName: 'Ploy Chaiyaphon',
    category: 'Illustrator',
    bio: 'Chiang Mai illustrator drawing daily webcomics about street food, temple cats, and rainy-season markets.',
    goalAmount: '40',
    funded: true,
  },
  {
    handle: 'lenbeats',
    displayName: 'Len Suriya',
    category: 'Lo-fi Musician',
    bio: 'Bangkok bedroom producer making lo-fi beats to study and ride the BTS to.',
    goalAmount: '30',
    funded: false,
  },
  {
    handle: 'mirapixels',
    displayName: 'Mira Tan',
    category: 'Game Artist',
    bio: 'Pixel artist and indie game dev crafting a cozy farming RPG set in the Mekong delta.',
    goalAmount: '50',
    funded: false,
  },
];

async function main() {
  console.log('Sorak seed — issuer:', badgeIssuerPublicKey());
  await fundIfNeeded(badgeIssuerPublicKey(), 'platform issuer');

  const created: Record<string, { id: string; owner: Keypair }> = {};
  for (const c of CREATORS) {
    const owner = Keypair.random();
    const creator = await creatorService.create({
      handle: c.handle,
      displayName: c.displayName,
      category: c.category,
      bio: c.bio,
      goalAmount: c.goalAmount,
      ownerPublicKey: owner.publicKey(),
      badgePrefix: env.BADGE_ASSET_PREFIX,
    });
    created[c.handle] = { id: creator.id, owner };
    console.log(`Creator @${c.handle} -> ${owner.publicKey()}`);
    if (c.funded) {
      await fundIfNeeded(owner.publicKey(), `@${c.handle} owner`);
      await addUsdcTrustline(owner);
      await creatorService.refreshOnchainState(creator);
      console.log(`  [+] @${c.handle} funded + USDC trustline`);
    }
  }

  const ploy = created.ploydraws;
  const fanNames = ['Anong', 'Krit', 'Siriwan', 'Nattapong', 'Ratana'];
  const amounts = ['1.5', '2', '1', '3', '2.5'];
  console.log('\nSending real testnet tips to @ploydraws...');
  const txHashes: string[] = [];
  for (let i = 0; i < fanNames.length; i++) {
    const fan = Keypair.random();
    await fundIfNeeded(fan.publicKey(), `fan ${fanNames[i]}`);
    const hash = await sendXlmTip(fan, ploy.owner.publicKey(), amounts[i], 'ploydraws');
    await sleep(1200);
    const { tip, reached } = await tipService.recordTip({
      handle: 'ploydraws',
      fanPublicKey: fan.publicKey(),
      fanName: fanNames[i],
      asset: 'XLM',
      amount: amounts[i],
      message: `Love your work, ${fanNames[i]} here!`,
      method: 'direct',
      txHash: hash,
    });
    txHashes.push(hash);
    const minted = reached.filter((r) => r.badge).length;
    console.log(`  tip #${i + 1} ${amounts[i]} XLM ${tip.status} tx=${hash.slice(0, 10)}… badges=${minted}`);
  }

  console.log('\nSending a claimable-balance tip to unfunded @lenbeats...');
  try {
    const fan = Keypair.random();
    await fundIfNeeded(fan.publicKey(), 'fan for claimable tip');
    const hash = await sendClaimableTip(fan, created.lenbeats.owner.publicKey(), '2');
    await sleep(1200);
    const { tip } = await tipService.recordTip({
      handle: 'lenbeats',
      fanPublicKey: fan.publicKey(),
      fanName: 'Pim',
      asset: 'XLM',
      amount: '2',
      message: 'Claim this when you connect a wallet!',
      method: 'claimable_balance',
      txHash: hash,
    });
    console.log(`  claimable tip ${tip.status} balanceId=${tip.claimableBalanceId?.slice(0, 12)}…`);
  } catch (err) {
    console.warn('  claimable tip skipped:', String(err));
  }

  const badges = await tipService.totalsForCreator(ploy.id);
  console.log('\nDone. @ploydraws totals:', badges);
  console.log('Demo tx (stellar.expert):');
  for (const h of txHashes.slice(0, 3)) {
    console.log(`  https://stellar.expert/explorer/public/tx/${h}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
