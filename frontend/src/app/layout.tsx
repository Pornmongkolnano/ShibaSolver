// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CookieConsentModal from "@/components/CookieConsentModal";
import TopMenu from "@/components/topMenu/TopMenu";
import { NotificationProvider } from "@/context/NotificationContext"; // ✅ import

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shiba Solver",
  description: "It's time to solve some problems!",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* ✅ Provider wraps TopMenu + pages so both can use the same context */}
        <NotificationProvider>
          <TopMenu />
          {children}
          <CookieConsentModal />
        </NotificationProvider>
      </body>
    </html>
  );
}
