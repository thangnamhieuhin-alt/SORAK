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
  buildPaymentXdr: vi.fn().mockResolvedValue('PAYMENT_XDR'),
  submitTransaction: vi.fn(),
}));
vi.mock('@/server/stellar/claimable', () => ({
  buildCreateClaimableBalanceXdr: vi.fn().mockResolvedValue('CB_XDR'),
  buildClaimClaimableBalanceXdr: vi.fn().mockResolvedValue('CLAIM_XDR'),
  getClaimableBalanceIdFromTx: vi.fn().mockResolvedValue('BAL'),
}));
vi.mock('@/server/stellar/tx', () => ({
  getTransaction: vi.fn().mockResolvedValue({ successful: true }),
}));
vi.mock('@/server/stellar/assets', () => ({
  mintBadgeToFan: vi.fn(),
}));

import { mintBadgeToFan } from '@/server/stellar/assets';
import { creatorService } from '@/server/service/creator.service';
import { milestoneService } from '@/server/service/milestone.service';
import { tipService } from '@/server/service/tip.service';
import { randomPk, truncateAll } from '../helpers';

const owner = randomPk();

async function tip(handle: string, fan: string, n: string) {
  return tipService.recordTip({
    handle,
    fanPublicKey: fan,
    asset: 'XLM',
    amount: '2',
    method: 'direct',
    txHash: n.repeat(64).slice(0, 64),
  });
}

describe('milestoneService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(mintBadgeToFan).mockResolvedValue({
      txHash: 'a'.repeat(64),
      balanceId: 'b'.repeat(72),
      issuerPublicKey: 'ISSUER',
    });
    await truncateAll();
  });
  afterAll(async () => truncateAll());

  it('reaches and mints tiers as supporter count grows', async () => {
    const creator = await creatorService.create({
      handle: 'ploy',
      displayName: 'Ploy',
      ownerPublicKey: owner,
      badgePrefix: 'SRKB',
    });
    for (const [i, f] of [randomPk(), randomPk(), randomPk(), randomPk(), randomPk()].entries()) {
      await tip('ploy', f, String(i));
    }
    const milestones = await milestoneService.listFor(creator.id);
    expect(milestones.every((m) => m.status === 'badge_minted')).toBe(true);
    const badges = await milestoneService.badgesFor(creator.id);
    expect(badges).toHaveLength(3);
    expect(mintBadgeToFan).toHaveBeenCalledTimes(3);
  });

  it('does not double-mint a milestone already reached', async () => {
    const creator = await creatorService.create({
      handle: 'noona',
      displayName: 'Noona',
      ownerPublicKey: owner,
      badgePrefix: 'SRKB',
    });
    await tip('noona', randomPk(), '1');
    await tip('noona', randomPk(), '2');
    const badges = await milestoneService.badgesFor(creator.id);
    expect(badges.length).toBeLessThanOrEqual(1);
  });

  it('keeps the milestone reached (not minted) when the on-chain mint fails', async () => {
    vi.mocked(mintBadgeToFan).mockRejectedValue(new Error('horizon down'));
    const creator = await creatorService.create({
      handle: 'mai',
      displayName: 'Mai',
      ownerPublicKey: owner,
      badgePrefix: 'SRKB',
    });
    await tip('mai', randomPk(), '1');
    const badges = await milestoneService.badgesFor(creator.id);
    expect(badges).toHaveLength(0);
    const milestones = await milestoneService.listFor(creator.id);
    expect(milestones.find((m) => m.tier === 1)?.status).toBe('reached');
  });
});
