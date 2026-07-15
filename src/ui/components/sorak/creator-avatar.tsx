import { avatarGradient, initials } from '@/ui/lib/avatar';
import { cn } from '@/ui/lib/utils';

export function CreatorAvatar({
  displayName,
  color,
  className,
}: {
  displayName: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid place-items-center rounded-2xl bg-gradient-to-br font-semibold text-white shadow-sm',
        avatarGradient(color),
        className,
      )}
    >
      {initials(displayName)}
    </span>
  );
}
