'use client';

import { Check, Copy, ExternalLink, HandCoins, Loader2, Trophy, Users, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { QrImage } from '@/ui/components/shared/qr-image';
import { MilestoneList } from '@/ui/components/sorak/milestone-list';
import { OnboardingForm } from '@/ui/components/sorak/onboarding-form';
import { StatTile } from '@/ui/components/sorak/stat-tile';
import { Button } from '@/ui/components/ui/button';
import { Card, CardContent } from '@/ui/components/ui/card';
import { Skeleton } from '@/ui/components/ui/skeleton';
import { useCreator } from '@/ui/hooks/useCreator';
import { useMyCreators } from '@/ui/hooks/useMyCreators';
import { useSession } from '@/ui/hooks/useSession';
import { useSignAndSubmit } from '@/ui/hooks/useSignAndSubmit';
import { useToast } from '@/ui/hooks/useToast';
import { formatTipAmount, sumAsNumber, testnetAccountUrl } from '@/ui/lib/amount';
import { apiPost } from '@/ui/lib/api';
import type { Creator, Tip } from '@/ui/lib/types';

export function Dashboard() {
  const { session, loading: sessionLoading } = useSession();
  const owner = session.publicKey;
  const { creators, loading, reload } = useMyCreators(!!owner);

  if (sessionLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!owner) return null;

  if (creators.length === 0) {
    return <OnboardingForm onCreated={reload} />;
  }

  return <DashboardContent creator={creators[0]} ownerKey={owner} />;
}

function DashboardContent({ creator, ownerKey }: { creator: Creator; ownerKey: string }) {
  const { detail, tips, loading, reload } = useCreator(creator.handle);
  const signAndSubmit = useSignAndSubmit();
  const { toast } = useToast();
  const [pageUrl, setPageUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [trustlineBusy, setTrustlineBusy] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  useEffect(() => {
    setPageUrl(`${window.location.origin}/c/${creator.handle}`);
  }, [creator.handle]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Page link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const onEnableUsdc = async () => {
    setTrustlineBusy(true);
    try {
      const { xdr } = await apiPost<{ xdr: string }>('/api/onboarding/trustline');
      await signAndSubmit(xdr, ownerKey);
      toast.success('USDC enabled — you can now receive USDC directly.');
      void reload();
    } catch (err) {
      toast.error((err as Error).message || 'Could not enable USDC. Please try again.');
    } finally {
      setTrustlineBusy(false);
    }
  };

  const onClaim = async (tip: Tip) => {
    setClaimingId(tip.id);
    try {
      const { xdr } = await apiPost<{ xdr: string }>(`/api/tips/${tip.id}/claim`, {
        claimantPublicKey: ownerKey,
      });
      const txHash = await signAndSubmit(xdr, ownerKey);
      await apiPost(`/api/tips/${tip.id}/claim/confirm`, { txHash });
      toast.success('Tip claimed to your wallet.');
      void reload();
    } catch (err) {
      toast.error((err as Error).message || 'Could not claim this tip. Please try again.');
    } finally {
      setClaimingId(null);
    }
  };

  if (loading && !detail) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const totals = detail?.totals ?? { tipCount: 0, supporters: 0, totalXlm: '0', totalUsdc: '0' };
  const milestones = detail?.milestones ?? [];
  const badges = detail?.badges ?? [];
  const tipUri = detail?.tipUri ?? '';
  const received = sumAsNumber(totals.totalXlm, totals.totalUsdc);
  const claimable = tips.filter((t) => t.status === 'claimable');

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div>
        <p className="text-sm font-semibold text-primary-press">Your dashboard</p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground">{creator.displayName}</h1>
        <p className="mt-1 font-mono text-sm text-slate-600 dark:text-slate-400">
          /c/{creator.handle}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={HandCoins} label="Total tips" value={String(totals.tipCount)} />
        <StatTile icon={Users} label="Supporters" value={String(totals.supporters)} />
        <StatTile icon={Trophy} label="Badges minted" value={String(badges.length)} />
        <StatTile
          icon={Wallet}
          label="Received"
          value={formatTipAmount(received)}
          hint="XLM + USDC"
        />
      </div>

      {!creator.usdcTrustline ? (
        <Card className="rounded-2xl border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Enable USDC payments</h2>
              <p className="mt-1 text-base text-slate-700 dark:text-slate-300">
                Add a USDC trustline so supporters can tip you in USDC directly. The setup fee is
                sponsored by Sorak.
              </p>
            </div>
            <Button
              onClick={onEnableUsdc}
              disabled={trustlineBusy}
              size="lg"
              className="h-11 rounded-full text-base"
            >
              {trustlineBusy ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Enabling…
                </>
              ) : (
                'Enable USDC (fees sponsored)'
              )}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-8">
          <div>
            <h2 className="mb-4 text-2xl font-semibold text-foreground">Milestones</h2>
            <MilestoneList milestones={milestones} supporters={totals.supporters} />
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-semibold text-foreground">Claimable tips</h2>
            {claimable.length === 0 ? (
              <p className="text-base text-slate-700 dark:text-slate-300">
                No claimable tips right now. Tips sent before your account was funded show up here
                to claim.
              </p>
            ) : (
              <ul className="space-y-3">
                {claimable.map((tip) => (
                  <li
                    key={tip.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {tip.fanName || 'Anonymous fan'}
                      </p>
                      <p className="tnum text-base font-bold text-foreground">
                        {formatTipAmount(tip.amount)} {tip.asset}
                      </p>
                    </div>
                    <Button
                      onClick={() => onClaim(tip)}
                      disabled={claimingId === tip.id}
                      className="h-11 rounded-full text-base"
                    >
                      {claimingId === tip.id ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Claiming…
                        </>
                      ) : (
                        'Claim'
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-2xl font-semibold text-foreground">Share your page</h2>
          <Card className="rounded-2xl">
            <CardContent className="space-y-5 p-6">
              <div>
                <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Your page link
                </span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-xl border border-border bg-muted/40 px-3 py-2.5 font-mono text-sm text-foreground">
                    {pageUrl || `/c/${creator.handle}`}
                  </code>
                  <Button
                    onClick={onCopy}
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-xl"
                    aria-label="Copy page link"
                  >
                    {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 border-t border-border pt-5">
                {tipUri ? <QrImage value={tipUri} size={200} className="rounded-xl" /> : null}
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Supporters scan this to tip you instantly
                </p>
              </div>

              <a
                href={testnetAccountUrl(creator.ownerPublicKey)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary-press"
              >
                View your account on Stellar Expert
                <ExternalLink className="h-4 w-4" />
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
