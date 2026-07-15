'use client';

import { Loader2, Send, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/ui/components/ui/button';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Textarea } from '@/ui/components/ui/textarea';
import { useFreighter } from '@/ui/hooks/useFreighter';
import { useTipping } from '@/ui/hooks/useTipping';
import { useToast } from '@/ui/hooks/useToast';
import { isValidTipAmount, TIP_MAX, TIP_MIN } from '@/ui/lib/amount';
import type { RecordTipResult, TipAsset } from '@/ui/lib/types';
import { cn } from '@/ui/lib/utils';

const PRESETS = ['1', '5', '10'];

const PHASE_LABEL: Record<string, string> = {
  building: 'Preparing transaction…',
  signing: 'Waiting for signature in Freighter…',
  submitting: 'Submitting to Stellar…',
  recording: 'Confirming your tip…',
};

export function TipPanel({
  handle,
  onRecorded,
}: {
  handle: string;
  onRecorded: (result: RecordTipResult) => void;
}) {
  const { publicKey, isAvailable, isConnected, connect } = useFreighter();
  const { phase, error, sendTip, reset } = useTipping();
  const { toast } = useToast();

  const [asset, setAsset] = useState<TipAsset>('XLM');
  const [amount, setAmount] = useState('5');
  const [fanName, setFanName] = useState('');
  const [message, setMessage] = useState('');
  const [connecting, setConnecting] = useState(false);

  const busy =
    phase === 'building' || phase === 'signing' || phase === 'submitting' || phase === 'recording';
  const amountValid = isValidTipAmount(amount);
  const fanKey = isConnected ? publicKey : null;

  const onConnect = async () => {
    setConnecting(true);
    try {
      const pk = await connect();
      if (!pk) toast.error('Could not read your wallet. Unlock Freighter and retry.');
    } finally {
      setConnecting(false);
    }
  };

  const onSend = async () => {
    if (!fanKey) return;
    reset();
    const result = await sendTip({
      handle,
      fanPublicKey: fanKey,
      fanName: fanName.trim() || undefined,
      asset,
      amount,
      message: message.trim() || undefined,
    });
    if (result) {
      toast.success('Tip sent — thank you for the cheer!');
      setMessage('');
      onRecorded(result);
    }
  };

  if (!isAvailable) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-5 text-center">
        <p className="mb-3 text-base text-slate-700 dark:text-slate-300">
          Install the Freighter wallet extension to send a tip from this browser.
        </p>
        <Button asChild variant="outline" className="h-11 rounded-full text-base">
          <a href="https://www.freighter.app/" target="_blank" rel="noreferrer">
            Install Freighter
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Asset
        </span>
        <div className="grid grid-cols-2 gap-2">
          {(['XLM', 'USDC'] as TipAsset[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAsset(a)}
              className={cn(
                'flex h-11 items-center justify-center rounded-xl border text-base font-semibold transition-colors',
                asset === a
                  ? 'border-primary bg-primary/10 text-primary-press'
                  : 'border-border bg-background text-slate-700 hover:bg-muted dark:text-slate-300',
              )}
            >
              {a}
              {a === 'USDC' ? (
                <span className="ml-1.5 text-xs font-normal text-slate-500">opt-in</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="tip-amount" className="mb-2 block text-sm font-medium">
          Amount ({asset})
        </Label>
        <div className="mb-2 flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p)}
              className={cn(
                'h-11 flex-1 rounded-xl border text-base font-bold transition-colors',
                amount === p
                  ? 'border-primary bg-primary/10 text-primary-press'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <Input
          id="tip-amount"
          type="number"
          inputMode="decimal"
          min={TIP_MIN}
          max={TIP_MAX}
          step="0.5"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-11 text-base"
        />
        {!amountValid ? (
          <p className="mt-1.5 text-sm font-medium text-rose-600 dark:text-rose-400">
            Enter an amount between {TIP_MIN} and {TIP_MAX} {asset}.
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="tip-name" className="mb-2 block text-sm font-medium">
          Your name (optional)
        </Label>
        <Input
          id="tip-name"
          value={fanName}
          maxLength={40}
          onChange={(e) => setFanName(e.target.value)}
          placeholder="Anonymous fan"
          className="h-11 text-base"
        />
      </div>

      <div>
        <Label htmlFor="tip-message" className="mb-2 block text-sm font-medium">
          Message (optional)
        </Label>
        <Textarea
          id="tip-message"
          value={message}
          maxLength={280}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Say something nice…"
          className="min-h-[80px] text-base"
        />
      </div>

      {fanKey ? (
        <Button
          onClick={onSend}
          disabled={busy || !amountValid}
          size="lg"
          className="h-12 w-full rounded-full text-base"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {PHASE_LABEL[phase] ?? 'Working…'}
            </>
          ) : (
            <>
              <Send className="mr-2 h-5 w-5" />
              Send tip
            </>
          )}
        </Button>
      ) : (
        <Button
          onClick={onConnect}
          disabled={connecting}
          size="lg"
          className="h-12 w-full rounded-full text-base"
        >
          {connecting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              <Wallet className="mr-2 h-5 w-5" />
              Connect wallet to tip
            </>
          )}
        </Button>
      )}

      {error ? (
        <p className="rounded-xl bg-rose-100 px-4 py-3 text-sm font-medium text-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
