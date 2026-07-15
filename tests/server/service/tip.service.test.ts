// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/stellar/account', () => ({
  loadAccountState: vi.fn(),
  loadAccountSequence: vi.fn().mockResolvedValue('1'),
}));
vi.mock('@/server/stellar/xdr', () => ({
  buildPaymentXdr: vi.fn().mockResolvedValue('PAYMENT_XDR'),
  submitTransaction: vi.fn(),
}));
vi.mock('@/server/stellar/claimable', () => ({
  buildCreateClaimableBalanceXdr: vi.fn().mockResolvedValue('CB_XDR'),
  buildClaimClaimableBalanceXdr: vi.fn().mockResolvedValue('CLAIM_XDR'),
  getClaimableBalanceIdFromTx: vi.fn().mockResolvedValue('BALANCE_ID_00000000000000000000000000000000000000000000000000000000'),
}));
vi.mock('@/server/stellar/tx', () => ({
  getTransaction: vi.fn(),
}));
vi.mock('@/server/stellar/milestone-contract', () => ({
  buildRecordTipInvoke: vi.fn().mockResolvedValue('RECORD_TIP_XDR'),
  submitRecordTipXdr: vi.fn().mockResolvedValue({ hash: 'c'.repeat(64), tier: 0 }),
  readTotalGiven: vi.fn().mockResolvedValue(0n),
  readSupporterTier: vi.fn().mockResolvedValue(0),
  tierForTotal: vi.fn().mockReturnValue(0),
}));
vi.mock('@/server/stellar/assets', () => ({
  mintBadgeToFan: vi
    .fn()
    .mockResolvedValue({ txHash: 'a'.repeat(64), balanceId: 'b'.repeat(72), issuerPublicKey: 'ISSUER' }),
}));

import { loadAccountState } from '@/server/stellar/account';
import { buildPaymentXdr } from '@/server/stellar/xdr';
import { buildCreateClaimableBalanceXdr } from '@/server/stellar/claimable';
import { getTransaction } from '@/server/stellar/tx';
import { buildRecordTipInvoke } from '@/server/stellar/milestone-contract';
import { creatorService } from '@/server/service/creator.service';
import {
  assertTransition,
  TIP_TRANSITIONS,
  tipService,
} from '@/server/service/tip.service';
import { TIP_STATUSES, type TipStatus } from '@/server/db/schema/tips';
import { randomPk, truncateAll } from '../helpers';

const owner = randomPk();
const fan = randomPk();

async function makeCreator(handle = 'ploy') {
  return creatorService.create({
    handle,
    displayName: 'Ploy',
    ownerPublicKey: owner,
    badgePrefix: 'SRKB',
  });
}

function fundedFor(usdcTrustline = true) {
  vi.mocked(loadAccountState).mockResolvedValue({
    exists: true,
    sequence: '1',
    xlmBalance: '100',
    usdcBalance: '10',
    usdcTrustline,
  });
}

function unfunded() {
  vi.mocked(loadAccountState).mockResolvedValue({
    exists: false,
    sequence: null,
    xlmBalance: '0',
    usdcBalance: '0',
    usdcTrustline: false,
  });
}

function confirmedTx() {
  vi.mocked(getTransaction).mockResolvedValue({ successful: true } as never);
}

describe('tip state machine', () => {
  it('accepts every declared valid transition', () => {
    for (const from of TIP_STATUSES) {
      for (const to of TIP_TRANSITIONS[from]) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  it('rejects every transition not declared valid', () => {
    for (const from of TIP_STATUSES) {
      for (const to of TIP_STATUSES) {
        if (TIP_TRANSITIONS[from].includes(to)) continue;
        expect(() => assertTransition(from, to as TipStatus)).toThrow();
      }
    }
  });

  it('rejects an unknown status', () => {
    expect(() => assertTransition('pending', 'nope' as TipStatus)).toThrow();
  });
});

describe('tipService.buildTip', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAll();
  });
  afterAll(async () => truncateAll());

  it('routes an XLM tip for a funded creator through the milestone contract', async () => {
    await makeCreator();
    fundedFor(true);
    const res = await tipService.buildTip({ handle: 'ploy', fanPublicKey: fan, asset: 'XLM', amount: '2' });
    expect(res.method).toBe('direct');
    expect(res.contract).toBe(true);
    expect(res.xdr).toBe('RECORD_TIP_XDR');
    expect(buildRecordTipInvoke).toHaveBeenCalled();
  });

  it('builds a claimable balance for an unfunded creator', async () => {
    await makeCreator();
    unfunded();
    const res = await tipService.buildTip({ handle: 'ploy', fanPublicKey: fan, asset: 'XLM', amount: '2' });
    expect(res.method).toBe('claimable_balance');
    expect(buildCreateClaimableBalanceXdr).toHaveBeenCalled();
  });

  it('uses a claimable balance for USDC when the creator has no trustline', async () => {
    await makeCreator();
    fundedFor(false);
    const res = await tipService.buildTip({ handle: 'ploy', fanPublicKey: fan, asset: 'USDC', amount: '2' });
    expect(res.method).toBe('claimable_balance');
  });

  it('rejects amounts outside the configured range', async () => {
    await makeCreator();
    fundedFor(true);
    await expect(tipService.buildTip({ handle: 'ploy', fanPublicKey: fan, asset: 'XLM', amount: '0' })).rejects.toThrow();
    await expect(tipService.buildTip({ handle: 'ploy', fanPublicKey: fan, asset: 'XLM', amount: '-1' })).rejects.toThrow();
    await expect(tipService.buildTip({ handle: 'ploy', fanPublicKey: fan, asset: 'XLM', amount: '0.1' })).rejects.toThrow();
    await expect(tipService.buildTip({ handle: 'ploy', fanPublicKey: fan, asset: 'XLM', amount: '9999' })).rejects.toThrow();
  });

  it('rejects an invalid fan public key', async () => {
    await makeCreator();
    fundedFor(true);
    await expect(
      tipService.buildTip({ handle: 'ploy', fanPublicKey: 'not-a-key', asset: 'XLM', amount: '2' }),
    ).rejects.toThrow();
  });
});

describe('tipService.recordTip + milestones', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAll();
    fundedFor(true);
    confirmedTx();
  });
  afterAll(async () => truncateAll());

  it('records a direct tip as confirmed and mints the first-supporter badge', async () => {
    await makeCreator();
    const { tip, reached } = await tipService.recordTip({
      handle: 'ploy',
      fanPublicKey: fan,
      fanName: 'Anong',
      asset: 'XLM',
      amount: '3',
      method: 'direct',
      txHash: 'c'.repeat(64),
    });
    expect(tip.status).toBe('confirmed');
    expect(reached.length).toBeGreaterThanOrEqual(1);
    expect(reached[0].badge).not.toBeNull();
  });

  it('records a claimable tip and stores the balance id', async () => {
    await makeCreator();
    const { tip } = await tipService.recordTip({
      handle: 'ploy',
      fanPublicKey: fan,
      asset: 'XLM',
      amount: '3',
      method: 'claimable_balance',
      txHash: 'd'.repeat(64),
    });
    expect(tip.status).toBe('claimable');
    expect(tip.claimableBalanceId).toBeTruthy();
  });

  it('rejects a tip whose transaction is not confirmed on Horizon', async () => {
    await makeCreator();
    vi.mocked(getTransaction).mockResolvedValue(null as never);
    await expect(
      tipService.recordTip({
        handle: 'ploy',
        fanPublicKey: fan,
        asset: 'XLM',
        amount: '3',
        method: 'direct',
        txHash: 'e'.repeat(64),
      }),
    ).rejects.toThrow();
  });

  it('aggregates totals and leaderboard from confirmed tips', async () => {
    const creator = await makeCreator();
    for (const f of [fan, randomPk(), randomPk()]) {
      await tipService.recordTip({
        handle: 'ploy',
        fanPublicKey: f,
        asset: 'XLM',
        amount: '2',
        method: 'direct',
        txHash: Array(64).fill(f[10]).join('').slice(0, 64),
      });
    }
    const totals = await tipService.totalsForCreator(creator.id);
    expect(totals.tipCount).toBe(3);
    expect(totals.supporters).toBe(3);
    const board = await tipService.leaderboard(creator.id);
    expect(board.length).toBe(3);
    const list = await tipService.listForCreator(creator.id);
    expect(list.length).toBe(3);
  });
});

describe('tipService claim flow', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAll();
    unfunded();
    confirmedTx();
  });
  afterAll(async () => truncateAll());

  async function makeClaimableTip() {
    await makeCreator();
    const { tip } = await tipService.recordTip({
      handle: 'ploy',
      fanPublicKey: fan,
      asset: 'XLM',
      amount: '2',
      method: 'claimable_balance',
      txHash: 'f'.repeat(64),
    });
    return tip;
  }

  it('builds a claim XDR for the creator', async () => {
    const tip = await makeClaimableTip();
    const res = await tipService.buildClaim(tip.id, owner);
    expect(res.xdr).toBe('CLAIM_XDR');
    expect(res.balanceId).toBeTruthy();
  });

  it('forbids a non-owner from claiming', async () => {
    const tip = await makeClaimableTip();
    await expect(tipService.buildClaim(tip.id, randomPk())).rejects.toThrow();
  });

  it('records a claim as claimed', async () => {
    const tip = await makeClaimableTip();
    const claimed = await tipService.recordClaim(tip.id, 'a'.repeat(64));
    expect(claimed.status).toBe('claimed');
  });

  it('throws NOT_FOUND for a missing tip', async () => {
    await expect(tipService.getTip('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });
});
