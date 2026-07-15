'use client';

import { signTransaction as freighterSignTransaction } from '@stellar/freighter-api';
import { ArrowLeft, HandCoins, Loader2, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { Button } from '@/ui/components/ui/button';
import { Card, CardContent } from '@/ui/components/ui/card';
import { useFreighter } from '@/ui/hooks/useFreighter';
import { useSession } from '@/ui/hooks/useSession';
import { useToast } from '@/ui/hooks/useToast';
import { networkPassphrase } from '@/ui/lib/amount';
import { apiPost } from '@/ui/lib/api';

async function signChallenge(txXdr: string, publicKey: string): Promise<string> {
  const result = await freighterSignTransaction(txXdr, {
    address: publicKey,
    networkPassphrase: networkPassphrase(),
  });
  if (typeof result === 'object' && result && 'error' in result && result.error) {
    throw new Error('Signature declined');
  }
  return (result as { signedTxXdr: string }).signedTxXdr;
}

export default function ConnectPage() {
  const router = useRouter();
  const { isAvailable, loading, connect } = useFreighter();
  const { refresh } = useSession();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const onConnect = async () => {
    setBusy(true);
    try {
      const pk = await connect();
      if (!pk) {
        toast.error('Could not read your wallet address. Unlock Freighter and retry.');
        return;
      }
      const { txXdr } = await apiPost<{ txXdr: string }>('/api/auth/challenge', { publicKey: pk });
      const signed = await signChallenge(txXdr, pk);
      await apiPost('/api/auth/verify', { publicKey: pk, signedNonce: signed });
      await refresh();
      toast.success('Wallet connected');
      router.push('/dashboard');
    } catch {
      toast.error('Sign-in failed. Please try connecting again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Button asChild variant="ghost" size="sm" className="mb-6 rounded-full">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to home
        </Link>
      </Button>
      <Card className="rounded-2xl">
        <CardContent className="space-y-6 p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <HandCoins className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Connect a wallet</h1>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Your Stellar wallet is your Sorak account.
              </p>
            </div>
          </div>

          <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
            Sign a one-time challenge with Freighter to prove you own your wallet. No password, no
            email — nothing leaves your device except a signature.
          </p>

          <Button
            onClick={onConnect}
            disabled={busy || !isAvailable}
            size="lg"
            className="h-11 w-full rounded-full text-base"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Waiting for signature…
              </>
            ) : (
              <>
                <Wallet className="mr-2 h-5 w-5" />
                Connect Freighter
              </>
            )}
          </Button>

          {!loading && !isAvailable ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
              <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
                Freighter is not installed in this browser. Install the extension to continue.
              </p>
              <Button asChild variant="outline" className="h-11 rounded-full text-base">
                <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
                  Install Freighter
                </a>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
