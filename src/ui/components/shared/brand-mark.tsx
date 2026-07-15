import { HandCoins } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

export function BrandMark({ className, label = 'Sorak' }: { className?: string; label?: string }) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold', className)}>
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <HandCoins className="h-5 w-5" />
      </span>
      <span className="text-lg tracking-tight text-foreground">{label}</span>
    </div>
  );
}
