// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/stellar/account', () => ({
  loadAccountState: vi.fn(),
  loadAccountSequence: vi.fn(),
}));

import { loadAccountState } from '@/server/stellar/account';
import { creatorService } from '@/server/service/creator.service';
import { randomPk, truncateAll } from '../helpers';

const owner = randomPk();

function baseInput(handle: string) {
  return {
    handle,
    displayName: 'Ploy Chaiyaphon',
    bio: 'Chiang Mai illustrator',
    category: 'Illustrator',
    ownerPublicKey: owner,
    badgePrefix: 'SRKB',
  };
}

describe('creatorService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
  });

  it('creates a creator and seeds three default milestones', async () => {
    const creator = await creatorService.create(baseInput('ploydraws'));
    expect(creator.handle).toBe('ploydraws');
    expect(creator.avatarColor).toBeTruthy();
    const milestones = await creatorService.milestonesFor(creator.id);
    expect(milestones).toHaveLength(3);
    expect(milestones.map((m) => m.badgeAssetCode)).toEqual(['SRKB1', 'SRKB2', 'SRKB3']);
  });

  it('normalizes handle to lowercase', async () => {
    const creator = await creatorService.create(baseInput('PloyArt'));
    expect(creator.handle).toBe('ployart');
  });

  it('rejects an invalid handle', async () => {
    await expect(creatorService.create(baseInput('a'))).rejects.toThrow();
  });

  it('rejects a duplicate handle', async () => {
    await creatorService.create(baseInput('dupe'));
    await expect(creatorService.create(baseInput('dupe'))).rejects.toThrow();
  });

  it('getByHandle throws NOT_FOUND for unknown handle', async () => {
    await expect(creatorService.getByHandle('ghost')).rejects.toThrow();
  });

  it('findByHandle returns null for unknown handle', async () => {
    expect(await creatorService.findByHandle('ghost')).toBeNull();
  });

  it('lists creators by owner and globally', async () => {
    await creatorService.create(baseInput('one'));
    await creatorService.create(baseInput('two'));
    expect(await creatorService.listByOwner(owner)).toHaveLength(2);
    expect(await creatorService.list()).toHaveLength(2);
  });

  it('refreshOnchainState updates funding + trustline flags from Horizon', async () => {
    const creator = await creatorService.create(baseInput('freshpage'));
    vi.mocked(loadAccountState).mockResolvedValue({
      exists: true,
      sequence: '1',
      xlmBalance: '10',
      usdcBalance: '5',
      usdcTrustline: true,
    });
    const updated = await creatorService.refreshOnchainState(creator);
    expect(updated.accountFunded).toBe(true);
    expect(updated.usdcTrustline).toBe(true);
  });

  it('refreshOnchainState returns the creator unchanged when Horizon fails', async () => {
    const creator = await creatorService.create(baseInput('offline'));
    vi.mocked(loadAccountState).mockRejectedValue(new Error('horizon down'));
    const same = await creatorService.refreshOnchainState(creator);
    expect(same.accountFunded).toBe(false);
  });

  it('getById returns the creator', async () => {
    const creator = await creatorService.create(baseInput('byid'));
    expect((await creatorService.getById(creator.id)).id).toBe(creator.id);
  });
});
