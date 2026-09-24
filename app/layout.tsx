import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ServiceWorkerRegister from "@/components/pwa/ServiceWorkerRegister";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://playmyjam.com.tr"),
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
  // Search Console sahiplik doğrulaması — Google OAuth marka doğrulaması domainin
  // bize ait olduğunu buradan görüyor. Doğrulama geçtikten sonra da kalmalı.
  verification: {
    google: "iYPFWH3Yc185LpwsJzaTN3l7ysvdzGL1r2-u6-qLH-U",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0a18",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Mekan panelinin ve müşteri sayfasının kendi manifest'i generateMetadata'dan
// geliyor, ama dinamik sayfalarda Next metadata'yı <body>'ye akıtıyor ve Chrome
// <body>'deki manifest bağlantısını görmüyor: kurulum "Bu uygulama yüklenemez"
// diye reddediliyordu. Bağlantı adresi yalnızca slug'a bağlı olduğundan
// ayrıştırma sırasında <head>'in en başına buradan konuyor (Chrome ilk
// manifest bağlantısını kullanır). React 19 hidrasyonu head'deki fazla
// etiketleri yok sayıyor.
const venueManifestScript = `(function(){try{
var m=location.pathname.match(/^\\/(admin|venue)\\/([^\\/]+)(?:\\/|$)/);
if(!m)return;var b="/"+m[1]+"/"+m[2],h=document.head;
var i=document.createElement("link");i.rel="apple-touch-icon";i.sizes="192x192";i.href=b+"/app-icon/192.png";h.prepend(i);
var l=document.createElement("link");l.rel="manifest";l.href=b+"/manifest.webmanifest";h.prepend(l);
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${geist.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: venueManifestScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-[#0f0a18] text-white">
        <ServiceWorkerRegister />
        {/* Dil tercihi istemcide tutulur: sunucuda cookie okunsaydı kök layout
            dinamikleşir, mekan kabuklarının statik üretimi bozulurdu. */}
        <LanguageProvider>{children}</LanguageProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
