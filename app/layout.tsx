import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://lijiajia96.github.io/research-prosperity/'),
  title: '科研兴盛度观测站',
  description: '用顶尖期刊论文的数量、质量与增长动量，观察全球科研版图。',
  openGraph: {
    title: '科研兴盛度观测站',
    description: '看见科学真正兴盛的方向',
    images: [{ url: '/research-prosperity/og.png', width: 1200, height: 630, alt: '科研兴盛度观测站' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '科研兴盛度观测站',
    description: '看见科学真正兴盛的方向',
    images: ['/research-prosperity/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
