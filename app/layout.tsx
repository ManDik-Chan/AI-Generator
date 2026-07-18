import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { NavigationFeedback } from "@/components/layout/navigation-feedback";
import { themeInitializationScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "AI-Generator",
    template: "%s · AI-Generator",
  },
  description: "简单、私密、低成本的私人 AI 助手平台。",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f7" },
    { media: "(prefers-color-scheme: dark)", color: "#07090f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head>
      <body><Suspense fallback={null}><NavigationFeedback /></Suspense><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
