import { Link } from '@/i18n/routing';
import { BrandMark } from '@/ui/components/shared/brand-mark';
import { LanguageSwitcher } from '@/ui/components/shared/language-switcher';
import { ThemeToggle } from '@/ui/components/shared/theme-toggle';
import { AccountChip } from './account-chip';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
        </Link>
        <nav className="ml-4 hidden items-center gap-5 text-sm font-medium md:flex">
          <Link href="/" className="text-slate-700 hover:text-foreground dark:text-slate-300">
            Explore
          </Link>
          <Link
            href="/dashboard"
            className="text-slate-700 hover:text-foreground dark:text-slate-300"
          >
            Dashboard
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <AccountChip />
        </div>
      </div>
    </header>
  );
}
