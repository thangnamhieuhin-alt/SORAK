'use client';

import { Award, ExternalLink, HandCoins, Trophy, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { QrImage } from '@/ui/components/shared/qr-image';
import { Confetti } from '@/ui/components/sorak/confetti';
import { CreatorAvatar } from '@/ui/components/sorak/creator-avatar';
import { MilestoneList } from '@/ui/components/sorak/milestone-list';
import { StatTile } from '@/ui/components/sorak/stat-tile';
import { TipPanel } from '@/ui/components/sorak/tip-panel';
import { TipStatusBadge } from '@/ui/components/sorak/tip-status-badge';
import { Button } from '@/ui/components/ui/button';
import { Card, CardContent } from '@/ui/components/ui/card';
import { Skeleton } from '@/ui/components/ui/skeleton';
import { useCreator } from '@/ui/hooks/useCreator';
import { useTipStream } from '@/ui/hooks/useTipStream';
import { useToast } from '@/ui/hooks/useToast';
import { formatTipAmount, sumAsNumber, testnetTxUrl } from '@/ui/lib/amount';
import type { RecordTipResult, Tip, TipStatus } from '@/ui/lib/types';
import { truncateAddress } from '@/ui/lib/utils';

type FeedItem = {
  id: string;
  fanName: string | null;
  asset: string;
  amount: string;
  message: string | null;
  status: TipStatus;
  stellarTxHash: string | null;
  createdAt: string;
};

function toFeedItem(tip: Tip): FeedItem {
  return {
    id: tip.id,
    fanName: tip.fanName,
    asset: tip.asset,
    amount: tip.amount,
    message: tip.message,
    status: tip.status,
    stellarTxHash: tip.stellarTxHash,
    createdAt: tip.createdAt,
  };
}

export function CreatorPage({ handle }: { handle: string }) {
  const { detail, tips, loading, error, reload } = useCreator(handle);
  const { toast } = useToast();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const [lastBadgeTx, setLastBadgeTx] = useState<string | null>(null);

  useEffect(() => {
    setFeed(tips.map(toFeedItem));
  }, [tips]);

  const prependFeed = useCallback((item: FeedItem) => {
    setFeed((prev) => {
      if (prev.some((f) => f.id === item.id)) return prev;
      return [item, ...prev].slice(0, 60);
    });
  }, []);

  useTipStream(handle, {
    onTip: (event) => {
      prependFeed({
        id: event.tipId,
        fanName: event.fanName,
        asset: event.asset,
        amount: event.amount,
        message: event.message,
        status: event.status,
        stellarTxHash: event.stellarTxHash,
        createdAt: event.occurredAt,
      });
    },
    onBadge: (event) => {
      setLastBadgeTx(event.stellarTxHash);
      setCelebrate(true);
      toast.success(`Badge ${event.assetCode} minted on-chain!`);
      setTimeout(() => setCelebrate(false), 200);
      void reload();
    },
  });

  const onRecorded = useCallback(
    (result: RecordTipResult) => {
      prependFeed(toFeedItem(result.tip));
      if (result.badges.length > 0) {
        setLastBadgeTx(result.badges[0].stellarTxHash);
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 200);
      }
      void reload();
    },
    [prependFeed, reload],
  );

  if (loading && !detail) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Creator not found</h1>
        <p className="mt-2 text-base text-slate-700 dark:text-slate-300">
          We could not find a Sorak page for “{handle}”. It may have been removed or never existed.
        </p>
        <Button asChild className="mt-6 h-11 rounded-full text-base">
          <Link href="/">Explore creators</Link>
        </Button>
      </div>
    );
  }

  const { creator, milestones, totals, leaderboard, tipUri } = detail;
  const totalReceived = sumAsNumber(totals.totalXlm, totals.totalUsdc);
  const goal = Number(creator.goalAmount) || 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round((totalReceived / goal) * 100)) : 0;

  return (
    <div className="relative">
      <Confetti active={celebrate} />

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-8">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-start gap-4">
              <CreatorAvatar
                displayName={creator.displayName}
                color={creator.avatarColor}
                className="h-20 w-20 text-2xl"
              />
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold text-foreground md:text-4xl">
                  {creator.displayName}
                </h1>
                <p className="mt-1 inline-flex items-center rounded-full bg-primary/10 px-3 py-0.5 text-sm font-semibold text-primary-press">
                  {creator.category}
                </p>
              </div>
            </div>

            {creator.bio ? (
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                {creator.bio}
              </p>
            ) : null}

            {goal > 0 ? (
              <div className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center justify-between text-base">
                  <span className="font-semibold text-foreground">Support goal</span>
                  <span className="tnum font-bold text-foreground">
                    {formatTipAmount(totalReceived)} / {formatTipAmount(goal)}
                  </span>
                </div>
                <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500"
                    style={{ width: `${goalPct}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-3 gap-3">
              <StatTile icon={HandCoins} label="Tips" value={String(totals.tipCount)} />
              <StatTile icon={Users} label="Supporters" value={String(totals.supporters)} />
              <StatTile
                icon={Trophy}
                label="Received"
                value={formatTipAmount(totalReceived)}
                hint="XLM + USDC"
              />
            </div>
          </div>

          <Card className="rounded-2xl">
            <CardContent className="space-y-5 p-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  Send {creator.displayName} a tip
                </h2>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Signed from your wallet, settled on Stellar mainnet.
                </p>
              </div>
              <TipPanel handle={handle} onRecorded={onRecorded} />
              <div className="flex flex-col items-center gap-2 border-t border-border pt-5">
                <QrImage value={tipUri} size={180} className="rounded-xl" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Scan to tip from a mobile wallet
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {lastBadgeTx ? (
        <section className="mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-100 px-5 py-4 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            <span className="inline-flex items-center gap-2 text-base font-semibold">
              <Award className="h-5 w-5" />A milestone badge was just minted on-chain!
            </span>
            <a
              href={testnetTxUrl(lastBadgeTx)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold underline"
            >
              View on Stellar Expert
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-8">
            <div>
              <h2 className="mb-4 text-2xl font-semibold text-foreground">Milestones</h2>
              <MilestoneList milestones={milestones} supporters={totals.supporters} />
            </div>

            <div>
              <h2 className="mb-4 text-2xl font-semibold text-foreground">Top supporters</h2>
              {leaderboard.length === 0 ? (
                <p className="text-base text-slate-700 dark:text-slate-300">
                  No supporters yet — be the first to cheer this creator on.
                </p>
              ) : (
                <Card className="rounded-2xl">
                  <CardContent className="divide-y divide-border p-0">
                    {leaderboard.map((entry, i) => (
                      <div
                        key={entry.fanPublicKey}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary-press">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {entry.fanName || truncateAddress(entry.fanPublicKey)}
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              {entry.tipCount} {entry.tipCount === 1 ? 'tip' : 'tips'}
                            </p>
                          </div>
                        </div>
                        <span className="tnum shrink-0 text-base font-bold text-foreground">
                          {formatTipAmount(sumAsNumber(entry.totalXlm, entry.totalUsdc))}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-semibold text-foreground">Recent tips</h2>
            {feed.length === 0 ? (
              <p className="text-base text-slate-700 dark:text-slate-300">
                No tips yet — be the first to cheer {creator.displayName} on.
              </p>
            ) : (
              <ul className="space-y-3">
                {feed.map((item) => (
                  <li key={item.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate font-semibold text-foreground">
                        {item.fanName || 'Anonymous fan'}
                      </span>
                      <span className="tnum shrink-0 text-base font-bold text-foreground">
                        {formatTipAmount(item.amount)} {item.asset}
                      </span>
                    </div>
                    {item.message ? (
                      <p className="mt-1.5 text-base text-slate-700 dark:text-slate-300">
                        {item.message}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <TipStatusBadge status={item.status} />
                      {item.stellarTxHash ? (
                        <a
                          href={testnetTxUrl(item.stellarTxHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-semibold text-primary-press"
                        >
                          On-chain
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
