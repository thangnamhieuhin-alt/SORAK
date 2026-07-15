import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { publicEnv } from '@/server/config/env.public';
import { PwaInstallPrompt } from '@/ui/components/pwa/pwa-install-prompt';
import { ServiceWorkerRegistration } from '@/ui/components/pwa/service-worker-registration';
import { Toaster } from '@/ui/components/ui/sonner';
import '../globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const calSans = localFont({
  src: '../fonts/CalSans-SemiBold.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-display',
});

const BRAND = 'Sorak';
const TAGLINE = 'Turn applause into on-chain support.';
const DESCRIPTION =
  'Sorak lets fans cheer creators with instant XLM and USDC tips on Stellar — and mints milestone badges on-chain when supporters rally.';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const metadataBase = new URL(publicEnv.NEXT_PUBLIC_APP_URL);
  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc] = loc === routing.defaultLocale ? '/' : `/${loc}`;
  }
  return {
    metadataBase,
    title: {
      default: `${BRAND} — ${TAGLINE}`,
      template: `%s · ${BRAND}`,
    },
    description: DESCRIPTION,
    applicationName: BRAND,
    keywords: ['Stellar', 'USDC', 'creator support', 'tipping', 'crypto tips', 'on-chain badges'],
    authors: [{ name: BRAND }],
    generator: 'Next.js',
    alternates: { canonical: '/', languages },
    openGraph: {
      type: 'website',
      siteName: BRAND,
      title: `${BRAND} — ${TAGLINE}`,
      description: DESCRIPTION,
      url: './',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${BRAND} — ${TAGLINE}`,
      description: DESCRIPTION,
    },
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: '#f43f5e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${calSans.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            {children}
            <ServiceWorkerRegistration />
            <PwaInstallPrompt />
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
