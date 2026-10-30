import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";

import "./globals.css";
import "./fonts/noto-sans-sc.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { NavigationFeedback } from "@/components/layout/navigation-feedback";
import { themeInitializationScript } from "@/lib/theme";

// One type system for the landing page and the app: Figtree for Latin, Noto Sans SC for Chinese.
// Both are self-hosted (app/fonts/README.md), so builds never fetch fonts from the network.
// Noto Sans SC is declared in ./fonts/noto-sans-sc.css, which also sets --font-sc.
const figtree = localFont({
  src: "./fonts/figtree-latin.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-latin",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

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
    <html className={figtree.variable} lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head>
      <body><Suspense fallback={null}><NavigationFeedback /></Suspense><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
