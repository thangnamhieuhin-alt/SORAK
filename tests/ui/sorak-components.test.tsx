import { cleanup, render, screen } from '@testing-library/react';
import { HandCoins } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { CreatorAvatar } from '@/ui/components/sorak/creator-avatar';
import { MilestoneList } from '@/ui/components/sorak/milestone-list';
import { StatTile } from '@/ui/components/sorak/stat-tile';
import { TipStatusBadge } from '@/ui/components/sorak/tip-status-badge';
import type { Milestone } from '@/ui/lib/types';

afterEach(cleanup);

function milestone(overrides: Partial<Milestone>): Milestone {
  return {
    id: overrides.id ?? 'm1',
    tier: overrides.tier ?? 1,
    title: overrides.title ?? 'First supporter',
    thresholdAmount: overrides.thresholdAmount ?? '1',
    badgeAssetCode: overrides.badgeAssetCode ?? 'SRKB1',
    status: overrides.status ?? 'badge_minted',
    reachedAt: overrides.reachedAt ?? null,
  };
}

describe('StatTile', () => {
  it('renders label and value', () => {
    render(<StatTile icon={HandCoins} label="Tips sent" value="6" />);
    expect(screen.getByText('Tips sent')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});

describe('TipStatusBadge', () => {
  it('renders a human label for each status', () => {
    render(<TipStatusBadge status="confirmed" />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('renders the claimable label', () => {
    render(<TipStatusBadge status="claimable" />);
    expect(screen.getByText('Claimable')).toBeInTheDocument();
  });
});

describe('CreatorAvatar', () => {
  it('renders initials from the display name', () => {
    render(<CreatorAvatar displayName="Ploy Chaiyaphon" color="rose" />);
    expect(screen.getByText('PC')).toBeInTheDocument();
  });
});

describe('MilestoneList', () => {
  it('renders milestone titles, badge codes and reached status', () => {
    render(
      <MilestoneList
        milestones={[
          milestone({ id: 'a', title: 'First supporter', badgeAssetCode: 'SRKB1' }),
          milestone({ id: 'b', tier: 2, title: 'Three supporters', badgeAssetCode: 'SRKB2', status: 'locked' }),
        ]}
        supporters={5}
      />,
    );
    expect(screen.getByText('First supporter')).toBeInTheDocument();
    expect(screen.getByText('Three supporters')).toBeInTheDocument();
    expect(screen.getByText('Badge SRKB1')).toBeInTheDocument();
    expect(screen.getByText('Badge minted')).toBeInTheDocument();
  });

  it('renders an instructional empty state when there are no milestones', () => {
    render(<MilestoneList milestones={[]} supporters={0} />);
    const empty = screen.getByText(/Milestones appear here once this creator sets supporter goals/i);
    expect(empty.textContent && empty.textContent.length).toBeGreaterThan(20);
  });
});
