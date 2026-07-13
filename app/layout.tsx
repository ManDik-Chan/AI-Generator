import type { Metadata, Viewport } from "next";

import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { themeInitializationScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "AI-Generator",
    template: "%s · AI-Generator",
  },
  description: "简单、私密、低成本的私人 AI 助手平台。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#13161b" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
