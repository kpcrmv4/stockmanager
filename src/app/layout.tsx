import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import { ToastContainer } from '@/components/ui/toast';
import { ThemeSync } from '@/components/theme-sync';
import './globals.css';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  variable: '--font-noto-sans-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'StockManager - ระบบจัดการสต๊อกเครื่องดื่ม',
  description: 'ระบบจัดการสต๊อกเครื่องดื่มและฝากเหล้า สำหรับร้านอาหารและบาร์',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'StockManager',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1f2937' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        {/* ป้องกันจอขาว flash ก่อน React hydrate โดยอ่าน theme จาก localStorage ทันที */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=JSON.parse(localStorage.getItem('stockmanager-app')||'{}');if(d.state&&d.state.theme==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${notoSansThai.variable} font-sans antialiased bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100`}
      >
        {children}
        <ThemeSync />
        <ToastContainer />
      </body>
    </html>
  );
}
