import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'PDF 問答',
  description: '匯入 PDF 後以 RAG 方式問答',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-3xl gap-6 px-6 py-4 text-sm">
            <Link href="/" className="font-medium hover:underline">
              問答
            </Link>
            <Link href="/documents" className="font-medium hover:underline">
              文件管理
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
