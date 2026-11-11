import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata, Viewport } from 'next'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Imoteasy — намери своя дом',
    template: '%s | Imoteasy',
  },
  description: 'Търси, сравнявай и публикувай имоти в България с Imoteasy — лесният път към следващия ти дом.',
  applicationName: 'Imoteasy',
  openGraph: {
    title: 'Imoteasy — намери своя дом',
    description: 'Имоти, които си пасват с живота ти.',
    locale: 'bg_BG',
    type: 'website',
  },
  icons: { icon: '/icon.svg' },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f7f2',
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bg" className="light">
      <body className="min-h-screen antialiased">
        <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3" href="#main-content">
          Към съдържанието
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <SpeedInsights />
      </body>
    </html>
  )
}
