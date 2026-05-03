import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fractal Virtual Team v4.0',
  description: '10 AI agents working 24/7 for Fractal MX',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-dark-900 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
