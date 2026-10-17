import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HumanPlus | Paneli privat",
  description: "Hulumtimi, planifikimi dhe vendimet e Human Plus.",
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
    <html lang="sq">
      <body className="antialiased">{children}</body>
    </html>
  );
}
