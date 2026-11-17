import type { Metadata } from "next";
import type { ReactNode } from "react";

import { StoreProvider } from "@/components/providers/StoreProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Present",
  description: "Present with your voice. Your slides follow along.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
