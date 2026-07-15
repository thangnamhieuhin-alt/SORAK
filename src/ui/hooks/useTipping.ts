'use client';

import { signTransaction as freighterSignTransaction } from '@stellar/freighter-api';
import { useCallback, useState } from 'react';
import { networkPassphrase } from '@/ui/lib/amount';
import { apiPost } from '@/ui/lib/api';
import type { BuildTipResult, RecordTipResult, TipAsset } from '@/ui/lib/types';

const HORIZON_URL = 'https://horizon.stellar.org';

export type TippingPhase =
  | 'idle'
  | 'building'
  | 'signing'
  | 'submitting'
  | 'recording'
  | 'success'
  | 'error';

export type SendTipInput = {
  handle: string;
  fanPublicKey: string;
  fanName?: string;
  asset: TipAsset;
  amount: string;
  message?: string;
};

async function signWithFreighter(xdr: string, address: string): Promise<string> {
  const result = await freighterSignTransaction(xdr, {
    address,
    networkPassphrase: networkPassphrase(),
  });
  if (typeof result === 'object' && result && 'error' in result && result.error) {
    throw new Error('Signature was declined in Freighter.');
  }
  return (result as { signedTxXdr: string }).signedTxXdr;
}

function describeHorizonError(payload: unknown): string {
  const extras = (payload as { extras?: { result_codes?: { transaction?: string } } })?.extras;
  const code = extras?.result_codes?.transaction;
  if (code === 'tx_bad_seq') {
    return 'The wallet used a stale sequence number. Please try sending again.';
  }
  if (code === 'tx_insufficient_balance') {
    return 'Not enough XLM in your wallet to cover this tip plus the network fee.';
  }
  if (code) return `The network rejected this transaction (${code}).`;
  return 'The network could not process this transaction. Please try again.';
}

async function submitToHorizon(signedXdr: string): Promise<string> {
  const res = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tx: signedXdr }),
  });
  const json = await res.json();
  if (!res.ok || !json.hash) throw new Error(describeHorizonError(json));
  return json.hash as string;
}

export function useTipping() {
  const [phase, setPhase] = useState<TippingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordTipResult | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setError(null);
    setResult(null);
  }, []);

  const sendTip = useCallback(async (input: SendTipInput): Promise<RecordTipResult | null> => {
    setError(null);
    setResult(null);
    try {
      setPhase('building');
      const built = await apiPost<BuildTipResult>('/api/tips/build', {
        handle: input.handle,
        fanPublicKey: input.fanPublicKey,
        asset: input.asset,
        amount: input.amount,
        message: input.message,
      });

      setPhase('signing');
      const signed = await signWithFreighter(built.xdr, input.fanPublicKey);

      if (built.contract) {
        setPhase('recording');
        const recorded = await apiPost<RecordTipResult>('/api/tips/record', {
          handle: input.handle,
          fanPublicKey: input.fanPublicKey,
          fanName: input.fanName,
          asset: input.asset,
          amount: input.amount,
          message: input.message,
          method: built.method,
          contract: true,
          signedXdr: signed,
        });
        setResult(recorded);
        setPhase('success');
        return recorded;
      }

      setPhase('submitting');
      const txHash = await submitToHorizon(signed);

      setPhase('recording');
      const recorded = await apiPost<RecordTipResult>('/api/tips/record', {
        handle: input.handle,
        fanPublicKey: input.fanPublicKey,
        fanName: input.fanName,
        asset: input.asset,
        amount: input.amount,
        message: input.message,
        method: built.method,
        txHash,
      });

      setResult(recorded);
      setPhase('success');
      return recorded;
    } catch (err) {
      setError((err as Error).message);
      setPhase('error');
      return null;
    }
  }, []);

  return { phase, error, result, sendTip, reset };
}
