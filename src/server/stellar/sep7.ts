import { usdcCode, usdcIssuer } from './network';

export type TipUriInput = {
  destination: string;
  amount?: string;
  asset: 'XLM' | 'USDC';
  memo?: string;
  message?: string;
  callback?: string;
};

/**
 * Build a SEP-7 `web+stellar:pay` URI. A fan's wallet app parses this to
 * prefill a payment to the creator. XLM is native (no asset params); USDC
 * carries asset_code + asset_issuer so any wallet resolves the right trustline.
 */
export function buildTipUri(input: TipUriInput): string {
  const params = new URLSearchParams();
  params.set('destination', input.destination);
  if (input.amount) params.set('amount', input.amount);
  if (input.asset === 'USDC') {
    params.set('asset_code', usdcCode());
    params.set('asset_issuer', usdcIssuer());
  }
  if (input.memo) {
    params.set('memo', input.memo);
    params.set('memo_type', 'MEMO_TEXT');
  }
  if (input.message) params.set('msg', input.message.slice(0, 28));
  return `web+stellar:pay?${params.toString()}`;
}
