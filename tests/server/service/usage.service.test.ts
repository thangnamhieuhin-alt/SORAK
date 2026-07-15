// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/stellar/account', () => ({
  loadAccountState: vi.fn().mockResolvedValue({
    exists: true,
    sequence: '1',
    xlmBalance: '100',
    usdcBalance: '0',
    usdcTrustline: true,
  }),
  loadAccountSequence: vi.fn().mockResolvedValue('1'),
}));
vi.mock('@/server/stellar/xdr', () => ({
  buildPaymentXdr: vi.fn().mockResolvedValue('X'),
  submitTransaction: vi.fn(),
}));
vi.mock('@/server/stellar/claimable', () => ({
  buildCreateClaimableBalanceXdr: vi.fn().mockResolvedValue('X'),
  buildClaimClaimableBalanceXdr: vi.fn().mockResolvedValue('X'),
  getClaimableBalanceIdFromTx: vi.fn().mockResolvedValue('BAL'),
}));
vi.mock('@/server/stellar/tx', () => ({
  getTransaction: vi.fn().mockResolvedValue({ successful: true }),
}));
vi.mock('@/server/stellar/assets', () => ({
  mintBadgeToFan: vi
    .fn()
    .mockResolvedValue({ txHash: 'a'.repeat(64), balanceId: 'b'.repeat(72), issuerPublicKey: 'I' }),
}));

import { creatorService } from '@/server/service/creator.service';
import { tipService } from '@/server/service/tip.service';
import { getUsageStats } from '@/server/service/usage.service';
import { randomPk, seedSession, truncateAll } from '../helpers';

describe('getUsageStats', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAll();
  });
  afterAll(async () => truncateAll());

  it('returns zeros on an empty platform', async () => {
    const stats = await getUsageStats();
    expect(stats.creators).toBe(0);
    expect(stats.totalTips).toBe(0);
    expect(stats.badgesMinted).toBe(0);
    expect(typeof stats.generatedAt).toBe('string');
  });

  it('counts wallets, creators, tips, supporters and badges from real rows', async () => {
    const owner = randomPk();
    await seedSession(owner);
    await creatorService.create({
      handle: 'ploy',
      displayName: 'Ploy',
      ownerPublicKey: owner,
      badgePrefix: 'SRKB',
    });
    const fanA = randomPk();
    await tipService.recordTip({
      handle: 'ploy',
      fanPublicKey: fanA,
      asset: 'XLM',
      amount: '2',
      method: 'direct',
      txHash: 'c'.repeat(64),
    });
    await tipService.recordTip({
      handle: 'ploy',
      fanPublicKey: randomPk(),
      asset: 'USDC',
      amount: '1',
      method: 'direct',
      txHash: 'd'.repeat(64),
    });

    const stats = await getUsageStats();
    expect(stats.uniqueWallets).toBe(1);
    expect(stats.logins).toBe(1);
    expect(stats.creators).toBe(1);
    expect(stats.totalTips).toBe(2);
    expect(stats.tipSupporters).toBe(2);
    expect(stats.badgesMinted).toBeGreaterThanOrEqual(1);
  });
});
