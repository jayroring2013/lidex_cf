import './globals.css'

import { Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { LocaleProvider } from '@/contexts/LocaleContext'
import { AvatarProvider } from '@/contexts/AvatarContext'
import { Suspense } from 'react'

const inter = Be_Vietnam_Pro({
  subsets:  ['latin', 'vietnamese'],
  weight:   ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display:  'swap',
})
const jetbrains = JetBrains_Mono({
  subsets:  ['latin'],
  variable: '--font-mono',
  display:  'swap',
  preload:  false, // monospace font only used for code/data — skip preloading
})


export const metadata = {
  title: 'LiDex - Light Novel, Anime & Manga Analytics',
  description: 'A personal project tracking LN/Anime/Manga data since 2026.',
}

const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem('lidex-theme');
    var isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrains.variable} font-sans min-h-screen`}
        style={{
          fontFamily: "var(--font-inter), 'Be Vietnam Pro', sans-serif",
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
      >
        <Suspense>
          <LocaleProvider>
            <AvatarProvider>
              <Navbar />
              <main className="pt-16">
                {children}
              </main>
              <Footer />
            </AvatarProvider>
          </LocaleProvider>
        </Suspense>
      </body>
    </html>
  )
}
