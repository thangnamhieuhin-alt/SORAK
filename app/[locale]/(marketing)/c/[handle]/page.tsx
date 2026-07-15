import { setRequestLocale } from 'next-intl/server';
import { CreatorPage } from '@/ui/components/pages/creator-page';

export default async function CreatorRoute({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  setRequestLocale(locale);
  return <CreatorPage handle={handle} />;
}
