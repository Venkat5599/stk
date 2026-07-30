import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "stk — new Solana code, separated from the copies",
    template: "%s — stk",
  },
  description:
    "Hundreds of programs deploy to Solana every day and most are duplicates. stk hashes the bytecode of every deploy and shows which programs are genuinely new code.",
  openGraph: { siteName: "stk", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
