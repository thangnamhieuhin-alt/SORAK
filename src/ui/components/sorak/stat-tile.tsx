import type { LucideIcon } from 'lucide-react';

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Icon className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="tnum mt-2 text-3xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}
