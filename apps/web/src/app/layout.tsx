import './globals.css';
import type { Metadata } from 'next';
import { PersonaSwitcher } from '@/components/PersonaSwitcher';

export const metadata: Metadata = {
  title: 'KhauGalli - Food Ordering & Delivery Platform',
  description: 'Multi-role Food Ordering & Delivery Platform (Customer, Kitchen, Delivery Partner, Admin)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col">
        <PersonaSwitcher />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
