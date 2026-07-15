import { HandCoins } from 'lucide-react';
import { publicEnv } from '@/server/config/env.public';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:text-slate-400">
        <div className="flex items-center gap-2">
          <HandCoins className="h-5 w-5 text-primary" />
          <span className="font-medium text-foreground">Sorak</span>
          <span>— running on Stellar mainnet.</span>
        </div>
        <a
          href={publicEnv.NEXT_PUBLIC_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-slate-700 hover:text-foreground dark:text-slate-300"
        >
          View source on GitHub
        </a>
      </div>
    </footer>
  );
}
