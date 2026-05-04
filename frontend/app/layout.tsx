import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fractal MX Office',
  description: '11 agentes IA trabajando 24/7 para Fractal MX',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Fractal Office',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/fractal-icon.svg', color: '#FF6B9D' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#FF6B9D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Fractal Office" />
        <meta name="msapplication-TileColor" content="#1a1530" />
        <meta name="msapplication-TileImage" content="/icons/icon-192.png" />

        {/* Icons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="mask-icon" href="/fractal-icon.svg" color="#FF6B9D" />
        <link rel="shortcut icon" href="/icons/icon-32.png" />
      </head>
      <body className="bg-dark-900 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
