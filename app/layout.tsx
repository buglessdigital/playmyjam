import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PlayMyJam",
  description: "Mekanda müziği sen seç",
  applicationName: "PlayMyJam",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PlayMyJam",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0a18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${geist.variable} antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0f0a18] text-white">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
