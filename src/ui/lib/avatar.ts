import type { AvatarColor } from '@/ui/lib/types';

const GRADIENTS: Record<AvatarColor, string> = {
  rose: 'from-rose-400 to-fuchsia-500',
  amber: 'from-amber-400 to-orange-500',
  violet: 'from-violet-400 to-indigo-500',
  emerald: 'from-emerald-400 to-teal-500',
  sky: 'from-sky-400 to-blue-500',
  fuchsia: 'from-fuchsia-400 to-pink-500',
};

export function avatarGradient(color: string): string {
  return GRADIENTS[(color as AvatarColor) in GRADIENTS ? (color as AvatarColor) : 'rose'];
}

export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}
