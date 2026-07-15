import type { ReactNode } from 'react';
import { SiteFooter } from '@/ui/components/layout/site-footer';
import { SiteHeader } from '@/ui/components/layout/site-header';
import { PageTransition } from '@/ui/components/shared/page-transition';
import { RequireAuth } from '@/ui/components/shared/require-auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <PageTransition>
          <RequireAuth>{children}</RequireAuth>
        </PageTransition>
      </main>
      <SiteFooter />
    </div>
  );
}
