import type { Metadata, Viewport } from "next";
import { Figtree, Noto_Sans_SC } from "next/font/google";
import { Suspense } from "react";

import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { NavigationFeedback } from "@/components/layout/navigation-feedback";
import { themeInitializationScript } from "@/lib/theme";

// One type system for the landing page and the app: Figtree for Latin, Noto Sans SC for Chinese.
const latin = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-latin", display: "swap" });
const chinese = Noto_Sans_SC({ weight: ["400", "500"], variable: "--font-sc", display: "swap", preload: false });

export const metadata: Metadata = {
  title: {
    default: "AI-Generator",
    template: "%s · AI-Generator",
  },
  description: "隐私优先的项目平台：展示、发布并在授权后运行你的项目；内置 AI Hub 提供对话、人格、长期记忆与工具。",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe8" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1415" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={`${latin.variable} ${chinese.variable}`} lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head>
      <body><Suspense fallback={null}><NavigationFeedback /></Suspense><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
