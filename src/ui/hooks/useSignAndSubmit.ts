'use client';

import { signTransaction as freighterSignTransaction } from '@stellar/freighter-api';
import { useCallback } from 'react';
import { networkPassphrase } from '@/ui/lib/amount';

const HORIZON_URL = 'https://horizon.stellar.org';

async function submitToHorizon(signedXdr: string): Promise<string> {
  const res = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tx: signedXdr }),
  });
  const json = await res.json();
  if (!res.ok || !json.hash) {
    throw new Error('The network could not process this transaction. Please try again.');
  }
  return json.hash as string;
}

export function useSignAndSubmit() {
  return useCallback(async (xdr: string, address: string): Promise<string> => {
    const result = await freighterSignTransaction(xdr, {
      address,
      networkPassphrase: networkPassphrase(),
    });
    if (typeof result === 'object' && result && 'error' in result && result.error) {
      throw new Error('Signature was declined in Freighter.');
    }
    const signedXdr = (result as { signedTxXdr: string }).signedTxXdr;
    return submitToHorizon(signedXdr);
  }, []);
}
