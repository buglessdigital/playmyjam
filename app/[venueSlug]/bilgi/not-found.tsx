import Link from "next/link";

// Kod yanlış yazılmış ya da mekan sayfası kapatılmış olabilir. Koyu kök 404
// yerine sayfanın kendi açık zeminiyle aynı dili konuşan sade bir ekran.
export default function HubNotFound() {
  return (
    <div className="min-h-dvh" style={{ background: "#faf7fc", color: "#1a1024" }}>
      <style>{`body { background: #faf7fc; }`}</style>
      <div className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col justify-center px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "#6e6580" }}>
          Sayfa bulunamadı
        </p>
        <h1 className="mt-4 text-[28px] leading-snug">
          Bu bağlantıya ait bir mekan sayfası yok.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "#6e6580" }}>
          Karekodu yeniden okutmayı deneyin. Masadaki plaketin diğer yüzündeki kod
          mekanın müzik sayfasına açılır.
        </p>
        <Link
          href="/"
          className="mt-8 self-start text-[15px] underline underline-offset-4"
          style={{ color: "#e91e8c" }}
        >
          PlayMyJam
        </Link>
      </div>
    </div>
  );
}
