import { Award, CircleDot, Lock } from 'lucide-react';
import type { Milestone } from '@/ui/lib/types';
import { cn } from '@/ui/lib/utils';

function statusMeta(status: Milestone['status']) {
  if (status === 'badge_minted') {
    return { label: 'Badge minted', Icon: Award, badge: 'bg-emerald-200 text-emerald-900' };
  }
  if (status === 'reached') {
    return { label: 'Reached', Icon: CircleDot, badge: 'bg-fuchsia-200 text-fuchsia-900' };
  }
  return { label: 'Locked', Icon: Lock, badge: 'bg-slate-200 text-slate-700' };
}

export function MilestoneList({
  milestones,
  supporters,
}: {
  milestones: Milestone[];
  supporters: number;
}) {
  if (milestones.length === 0) {
    return (
      <p className="text-base text-slate-700 dark:text-slate-300">
        Milestones appear here once this creator sets supporter goals.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {milestones.map((m) => {
        const threshold = Math.max(1, Number(m.thresholdAmount) || 1);
        const pct = Math.min(100, Math.round((supporters / threshold) * 100));
        const meta = statusMeta(m.status);
        return (
          <li key={m.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <meta.Icon className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">{m.title}</span>
              </div>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  meta.badge,
                )}
              >
                {meta.label}
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-slate-700 dark:text-slate-300">
                {Math.min(supporters, threshold)} / {threshold} supporters
              </span>
              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                Badge {m.badgeAssetCode}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
