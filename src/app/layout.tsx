import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ALDI Pinto — Plataforma Logística (Visor 3D)',
  description:
    'Gemelo digital de la plataforma logística de ALDI en Pinto: almacén, máquinas, stock, muelles y asistente IA.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${jakarta.variable} ${jetbrainsMono.variable} antialiased`}>{children}</body>
    </html>
  );
}