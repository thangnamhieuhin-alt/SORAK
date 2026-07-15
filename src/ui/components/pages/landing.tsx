'use client';

import {
  ArrowRight,
  Award,
  HandCoins,
  HeartHandshake,
  QrCode,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { GradientBg } from '@/ui/components/shared/gradient-bg';
import { CreatorAvatar } from '@/ui/components/sorak/creator-avatar';
import { StatTile } from '@/ui/components/sorak/stat-tile';
import { Button } from '@/ui/components/ui/button';
import { Card, CardContent } from '@/ui/components/ui/card';
import { Skeleton } from '@/ui/components/ui/skeleton';
import { useCreators } from '@/ui/hooks/useCreators';
import { useStats } from '@/ui/hooks/useStats';

const HOW_IT_WORKS = [
  {
    icon: QrCode,
    title: 'Share your page',
    body: 'Spin up a Sorak page and share a SEP-7 QR anywhere — streams, posts, or in person.',
  },
  {
    icon: HandCoins,
    title: 'Fans send a tip',
    body: 'Supporters cheer you on with XLM or USDC in seconds, signed straight from their wallet.',
  },
  {
    icon: Award,
    title: 'Badges mint on-chain',
    body: 'Hit a supporter milestone and Sorak mints a collectible badge to your fans on Stellar.',
  },
];

export function Landing() {
  const { stats } = useStats();
  const { creators, loading: creatorsLoading } = useCreators();
  const featured = creators.slice(0, 6);

  return (
    <div className="relative">
      <GradientBg />

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 md:pt-24 md:pb-20">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary-press">
              <Sparkles className="h-4 w-4" />
              Creator support on Stellar
            </p>
            <h1 className="text-5xl leading-[1.05] font-semibold text-foreground md:text-6xl">
              Turn applause into on-chain support.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-700 dark:text-slate-300">
              Sorak lets fans cheer the creators they love with instant XLM and USDC tips — and
              turns real support into milestone badges minted on Stellar.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-11 rounded-full px-6 text-base">
                <Link href="/connect">
                  Start your page
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-11 rounded-full px-6 text-base"
              >
                <a href="#creators">Explore creators</a>
              </Button>
            </div>
          </div>

          <Card className="relative overflow-hidden rounded-2xl border-border">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-glow-primary blur-3xl" />
            <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-glow-magenta blur-3xl" />
            <CardContent className="relative space-y-5 p-8">
              <p className="text-sm font-semibold text-primary-press">Live on Sorak</p>
              {featured[0] ? (
                <Link href={`/c/${featured[0].handle}`} className="flex items-center gap-3">
                  <CreatorAvatar
                    displayName={featured[0].displayName}
                    color={featured[0].avatarColor}
                    className="h-12 w-12 text-lg"
                  />
                  <div>
                    <p className="font-semibold text-foreground">{featured[0].displayName}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {featured[0].category}
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="h-12" />
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-surface-inset p-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">Tips sent</p>
                  <p className="tnum mt-1 text-2xl font-bold text-foreground">
                    {stats?.totalTips ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-inset p-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">Supporters</p>
                  <p className="tnum mt-1 text-2xl font-bold text-foreground">
                    {stats?.tipSupporters ?? '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-emerald-100 px-4 py-3 text-emerald-900">
                <Award className="h-5 w-5" />
                <span className="text-sm font-semibold">
                  {stats?.badgesMinted ?? 0} fan badges minted on-chain
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile icon={Users} label="Creators" value={String(stats?.creators ?? '—')} />
          <StatTile icon={HandCoins} label="Tips sent" value={String(stats?.totalTips ?? '—')} />
          <StatTile
            icon={HeartHandshake}
            label="Supporters"
            value={String(stats?.tipSupporters ?? '—')}
          />
          <StatTile
            icon={Trophy}
            label="Badges minted"
            value={String(stats?.badgesMinted ?? '—')}
          />
        </div>
      </section>

      <section id="creators" className="mx-auto max-w-6xl px-4 pb-14 scroll-mt-20">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-foreground">Featured creators</h2>
            <p className="mt-1 text-base text-slate-700 dark:text-slate-300">
              Discover people to cheer on and send your first tip.
            </p>
          </div>
        </div>

        {creatorsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-2xl" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="p-10 text-center">
              <p className="text-base text-slate-700 dark:text-slate-300">
                No creators yet — be the first to launch a Sorak page and start collecting cheers.
              </p>
              <Button asChild className="mt-4 h-11 rounded-full text-base">
                <Link href="/connect">Start your page</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((creator) => (
              <Link key={creator.id} href={`/c/${creator.handle}`} className="group block">
                <Card className="h-full rounded-2xl transition-shadow group-hover:shadow-md">
                  <CardContent className="space-y-3 p-6">
                    <div className="flex items-center gap-3">
                      <CreatorAvatar
                        displayName={creator.displayName}
                        color={creator.avatarColor}
                        className="h-12 w-12 text-lg"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">
                          {creator.displayName}
                        </p>
                        <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                          {creator.category}
                        </p>
                      </div>
                    </div>
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm text-slate-700 dark:text-slate-300">
                      {creator.bio || 'Cheer this creator on with your first tip.'}
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-press">
                      Send a tip
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="mb-6 text-3xl font-semibold text-foreground">How Sorak works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <Card key={step.title} className="rounded-2xl">
              <CardContent className="space-y-3 p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary-press">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-bold text-primary-press">Step {i + 1}</span>
                </div>
                <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="text-base text-slate-700 dark:text-slate-300">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
