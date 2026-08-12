import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YouTube Slide Extractor | DGX Spark',
  description: 'Extract distinct presentation slides from public YouTube talks using an NVIDIA DGX Spark.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
