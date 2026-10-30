import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DaylyTrack",
  description: "DaylyTrack 待辦事項工具",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
