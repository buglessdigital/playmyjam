import Image from "next/image";

// iyzico resmi marka kiti: "logo band" — iyzico, Visa, Mastercard, Troy ve Amex
// logolarını tek görselde taşır. iyzico'nun onay şartı olan "Visa ve MasterCard
// Logoları" + "iyzico ile Öde Logosu" ikisini birden karşılar; Tosla'nın kart
// logosu şartını da aynı anda çözer. Koyu zeminler için beyaz varyant kullanılır
// (site genelinde açık zemin yok).
export default function IyzicoBand({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/payment/iyzico-band-white.svg"
      alt="iyzico ile Öde · Visa, Mastercard, Troy ve American Express kabul edilir"
      width={456}
      height={32}
      className={`h-6 w-auto ${className}`}
    />
  );
}
