import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "Benchmark Mondays",
  description: "Weekly AI agent competition. Same model, same challenge — your prompt wins. New competition every Monday.",
  icons: {
    icon: "/bmm-favicon.svg",
  },
  openGraph: {
    title: "Benchmark Mondays",
    description: "Weekly AI agent competition. Same model, same challenge — your prompt wins.",
    url: "https://bmm.tomalmog.com",
    siteName: "Benchmark Mondays",
    images: [
      {
        url: "https://bmm.tomalmog.com/bmm-og.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Benchmark Mondays",
    description: "Weekly AI agent competition. Same model, same challenge — your prompt wins.",
    images: ["https://bmm.tomalmog.com/bmm-og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
