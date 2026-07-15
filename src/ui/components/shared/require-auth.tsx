'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Link, usePathname } from '@/i18n/routing';
import { Button } from '@/ui/components/ui/button';
import { Card, CardContent } from '@/ui/components/ui/card';
import { useRequireSession } from '@/ui/hooks/useRequireSession';

const PASSTHROUGH_PREFIXES = ['/connect'];

function isPassthrough(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const state = useRequireSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    if (!isPassthrough(pathname)) return;
    router.replace('/dashboard');
  }, [state.status, pathname, router]);

  if (isPassthrough(pathname)) return <>{children}</>;
  if (state.status === 'loading') return <>{children}</>;

  if (state.status === 'unauthenticated') {
    return (
      <div
        data-testid="require-auth-cta"
        className="mx-auto flex max-w-md flex-col items-center px-4 py-16"
      >
        <Card className="w-full rounded-2xl">
          <CardContent className="space-y-4 p-10 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Connect your wallet</h2>
              <p className="text-base text-slate-700 dark:text-slate-300">
                Your Stellar wallet is your Sorak account. Connect Freighter to open your creator
                dashboard, claim tips, and mint milestone badges.
              </p>
            </div>
            <div className="flex justify-center pt-2">
              <Button asChild className="h-11 rounded-full px-6 text-base" size="lg">
                <Link href="/connect">Connect wallet</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
