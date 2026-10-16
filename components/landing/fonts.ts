import { Bricolage_Grotesque, Geist_Mono } from "next/font/google";

// Vitrin sayfalarının başlık ve "etiket" yazıları. Uygulama genelinde Geist
// kalıyor; bu iki font yalnızca vitrinde (ana sayfa, mekanlar, mekan kaydı)
// yüklenir. latin-ext şart: ş, ğ, ı, İ glifleri orada.
export const displayFont = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
});

export const monoFont = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-mono-display",
});

export const landingFontVars = `${displayFont.variable} ${monoFont.variable}`;
