export type AvatarColor = 'rose' | 'amber' | 'violet' | 'emerald' | 'sky' | 'fuchsia';

export type TipAsset = 'XLM' | 'USDC';

export type TipMethod = 'direct' | 'claimable_balance';

export type TipStatus = 'pending' | 'submitted' | 'confirmed' | 'claimable' | 'claimed' | 'failed';

export type MilestoneStatus = 'locked' | 'reached' | 'badge_minted';

export interface Creator {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  category: string;
  avatarColor: AvatarColor;
  ownerPublicKey: string;
  goalAmount: string | null;
  usdcTrustline: boolean;
  accountFunded: boolean;
  network: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tip {
  id: string;
  creatorId: string;
  fanPublicKey: string;
  fanName: string | null;
  asset: TipAsset;
  amount: string;
  message: string | null;
  method: TipMethod;
  status: TipStatus;
  claimableBalanceId: string | null;
  stellarTxHash: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export interface Milestone {
  id: string;
  creatorId: string;
  tier: number;
  title: string;
  thresholdAmount: string;
  badgeAssetCode: string;
  status: MilestoneStatus;
  reachedAt: string | null;
  createdAt: string;
}

export interface Badge {
  id: string;
  creatorId: string;
  milestoneId: string;
  recipientPublicKey: string;
  recipientName: string | null;
  assetCode: string;
  issuerPublicKey: string;
  claimableBalanceId: string | null;
  stellarTxHash: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  fanPublicKey: string;
  fanName: string | null;
  tipCount: number;
  totalXlm: string;
  totalUsdc: string;
  lastTipAt: string;
}

export interface CreatorTotals {
  tipCount: number;
  supporters: number;
  totalXlm: string;
  totalUsdc: string;
}

export interface UsageStats {
  uniqueWallets: number;
  logins: number;
  creators: number;
  totalTips: number;
  tipSupporters: number;
  badgesMinted: number;
  generatedAt: string;
}

export interface CreatorDetail {
  creator: Creator;
  milestones: Milestone[];
  totals: CreatorTotals;
  leaderboard: LeaderboardEntry[];
  badges: Badge[];
  tipUri: string;
}

export interface BuildTipResult {
  method: TipMethod;
  xdr: string;
  asset: TipAsset;
  amount: string;
  destination: string;
  network: string;
  contract?: boolean;
}

export interface RecordTipResult {
  tip: Tip;
  badges: Badge[];
  reachedMilestones: Milestone[];
}

export interface TipStreamEvent {
  tipId: string;
  creatorId: string;
  status: TipStatus;
  asset: TipAsset;
  amount: string;
  fanName: string | null;
  message: string | null;
  stellarTxHash: string | null;
  occurredAt: string;
}

export interface BadgeMintedEvent {
  badgeId: string;
  creatorId: string;
  assetCode: string;
  recipientName: string | null;
  stellarTxHash: string | null;
  occurredAt: string;
}
