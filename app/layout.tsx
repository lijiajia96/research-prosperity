import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '科研兴盛度观测站',
  description: '用顶尖期刊论文的数量、质量与增长动量，观察全球科研版图。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
