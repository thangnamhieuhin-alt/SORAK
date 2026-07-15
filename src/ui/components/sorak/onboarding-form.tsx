'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/ui/components/ui/button';
import { Card, CardContent } from '@/ui/components/ui/card';
import { Input } from '@/ui/components/ui/input';
import { Label } from '@/ui/components/ui/label';
import { Textarea } from '@/ui/components/ui/textarea';
import { useToast } from '@/ui/hooks/useToast';
import { apiPost } from '@/ui/lib/api';
import type { Creator } from '@/ui/lib/types';

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export function OnboardingForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [category, setCategory] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleValid = HANDLE_RE.test(handle);
  const nameValid = displayName.trim().length >= 2;
  const canSubmit = handleValid && nameValid && !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setFormError(null);
    try {
      await apiPost<Creator>('/api/creators', {
        handle,
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        category: category.trim() || undefined,
        goalAmount: goalAmount.trim() || undefined,
      });
      toast.success('Your Sorak page is live!');
      onCreated();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Sparkles className="h-6 w-6" />
        </span>
        <h1 className="text-3xl font-semibold text-foreground">Launch your creator page</h1>
        <p className="mt-2 text-base text-slate-700 dark:text-slate-300">
          Claim a handle and start collecting cheers as XLM and USDC tips on Stellar.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <Label htmlFor="ob-handle" className="mb-2 block text-sm font-medium">
                Handle
              </Label>
              <Input
                id="ob-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                placeholder="aria-wave"
                className="h-11 text-base"
                required
              />
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                3–30 lowercase letters, numbers or hyphens. Your page will live at /c/
                {handle || 'your-handle'}.
              </p>
            </div>

            <div>
              <Label htmlFor="ob-name" className="mb-2 block text-sm font-medium">
                Display name
              </Label>
              <Input
                id="ob-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Aria Wave"
                className="h-11 text-base"
                required
              />
            </div>

            <div>
              <Label htmlFor="ob-category" className="mb-2 block text-sm font-medium">
                Category (optional)
              </Label>
              <Input
                id="ob-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Music · Live coder"
                className="h-11 text-base"
              />
            </div>

            <div>
              <Label htmlFor="ob-bio" className="mb-2 block text-sm font-medium">
                Bio (optional)
              </Label>
              <Textarea
                id="ob-bio"
                value={bio}
                maxLength={280}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell supporters what you create."
                className="min-h-[80px] text-base"
              />
            </div>

            <div>
              <Label htmlFor="ob-goal" className="mb-2 block text-sm font-medium">
                Support goal (optional)
              </Label>
              <Input
                id="ob-goal"
                type="number"
                inputMode="decimal"
                min="0"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                placeholder="100"
                className="h-11 text-base"
              />
            </div>

            {formError ? (
              <p className="rounded-xl bg-rose-100 px-4 py-3 text-sm font-medium text-rose-900 dark:bg-rose-950 dark:text-rose-200">
                {formError}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={!canSubmit}
              size="lg"
              className="h-12 w-full rounded-full text-base"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create my page'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
