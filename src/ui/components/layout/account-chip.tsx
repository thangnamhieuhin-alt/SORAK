'use client';

import { signTransaction as freighterSignTransaction } from '@stellar/freighter-api';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { Button } from '@/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/components/ui/dropdown-menu';
import { Skeleton } from '@/ui/components/ui/skeleton';
import { useFreighter } from '@/ui/hooks/useFreighter';
import { useSession } from '@/ui/hooks/useSession';
import { useToast } from '@/ui/hooks/useToast';
import { networkPassphrase, testnetAccountUrl } from '@/ui/lib/amount';
import { apiPost } from '@/ui/lib/api';
import { truncateAddress } from '@/ui/lib/utils';

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

export function AccountChip() {
  const {
    isAvailable,
    isConnected,
    loading: freighterLoading,
    connect,
    disconnect: disconnectFreighter,
  } = useFreighter();
  const { session, refresh, logout } = useSession();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  if (freighterLoading) {
    return <Skeleton data-testid="account-chip-loading" className="h-11 w-32 rounded-full" />;
  }

  const onConnect = async () => {
    setBusy(true);
    try {
      const pk = await connect();
      if (!pk) return;
      const { txXdr } = await apiPost<{ txXdr: string }>('/api/auth/challenge', { publicKey: pk });
      const signed = await signChallenge(txXdr, pk);
      await apiPost('/api/auth/verify', { publicKey: pk, signedNonce: signed });
      await refresh();
      toast.success('Wallet connected');
    } catch {
      toast.error('Could not connect wallet. Make sure Freighter is unlocked.');
      disconnectFreighter();
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    await logout();
    disconnectFreighter();
  };

  const onCopy = async () => {
    if (!session.publicKey) return;
    try {
      await navigator.clipboard.writeText(session.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success('Address copied');
    } catch {
      toast.error('Could not copy address');
    }
  };

  if (!isAvailable) {
    return (
      <Button variant="outline" size="sm" asChild className="h-11 rounded-full text-base">
        <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
          Install Freighter
        </a>
      </Button>
    );
  }

  if (!isConnected || !session.publicKey) {
    return (
      <Button
        onClick={onConnect}
        disabled={busy}
        className="h-11 rounded-full px-5 text-base"
        data-testid="account-chip-connect"
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Connecting…
          </>
        ) : (
          <>
            <Wallet className="mr-2 h-5 w-5" />
            Connect wallet
          </>
        )}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-11 rounded-full font-mono text-base"
          data-testid="account-chip"
        >
          {truncateAddress(session.publicKey, 4, 4)}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs text-slate-600 dark:text-slate-400">Freighter · Stellar Mainnet</p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">{session.publicKey}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCopy}>
          {copied ? (
            <Check className="mr-2 h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          Copy address
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={testnetAccountUrl(session.publicKey)} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            View on explorer
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDisconnect}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
