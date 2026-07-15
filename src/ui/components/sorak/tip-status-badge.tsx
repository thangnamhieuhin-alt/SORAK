import type { TipStatus } from '@/ui/lib/types';
import { cn } from '@/ui/lib/utils';

const STYLES: Record<TipStatus, string> = {
  pending: 'bg-amber-200 text-amber-900',
  submitted: 'bg-sky-200 text-sky-900',
  confirmed: 'bg-emerald-200 text-emerald-900',
  claimable: 'bg-fuchsia-200 text-fuchsia-900',
  claimed: 'bg-emerald-200 text-emerald-900',
  failed: 'bg-rose-200 text-rose-900',
};

const LABELS: Record<TipStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  claimable: 'Claimable',
  claimed: 'Claimed',
  failed: 'Failed',
};

export function TipStatusBadge({ status, className }: { status: TipStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        STYLES[status] ?? STYLES.pending,
        className,
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
