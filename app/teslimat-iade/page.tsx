import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import LegalFooter from "@/components/ui/LegalFooter";

export const metadata: Metadata = { title: "Teslimat ve İade Şartları — PlayMyJam" };

export default function TeslimatIadePage() {
  return (
    <>
      <main className="max-w-3xl mx-auto px-6 py-16 text-white">
        <h1 className="text-3xl font-bold mb-2">Teslimat ve İade Şartları</h1>
        <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 15 Temmuz 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Teslimat</h2>
          <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
            <li>
              Satın alınan jetonlar dijital üründür; ödeme onaylandığı anda hesabına{" "}
              <strong>otomatik ve anında</strong> yüklenir.
            </li>
            <li>Fiziksel kargo veya teslimat süreci yoktur, teslimat ücreti alınmaz.</li>
            <li>
              Jeton bakiyeni uygulamanın &quot;Jeton Satın Al&quot; sayfasından ve işlem
              geçmişinden anlık olarak görebilirsin.
            </li>
            <li>
              Ödemen onaylandığı halde jetonlar hesabına yüklenmediyse {COMPANY.email} adresine
              yazman yeterli; işlem kontrol edilip en geç 24 saat içinde düzeltilir.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. İade Koşulları</h2>
          <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
            <li>
              Jetonlar anında teslim edilen dijital ürün olduğundan, Mesafeli Sözleşmeler
              Yönetmeliği m.15/1-ğ uyarınca <strong>kullanılmaya başlanan paketlerde</strong>{" "}
              cayma hakkı bulunmaz.
            </li>
            <li>
              Paketteki jetonların <strong>hiçbiri kullanılmamışsa</strong>, satın alma
              tarihinden itibaren 14 gün içinde iade talep edebilirsin.
            </li>
            <li>
              Şarkı isteğin mekan tarafından <strong>reddedilirse</strong> harcanan jetonlar
              bakiyene otomatik iade edilir.
            </li>
            <li>
              Teknik bir hata nedeniyle çift tahsilat veya hatalı yükleme olursa fazla tutar
              koşulsuz iade edilir.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. İade Süreci</h2>
          <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
            <li>
              İade talebini, satın alma sırasında kullandığın hesap bilgileriyle birlikte{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>{" "}
              adresine ilet.
            </li>
            <li>Talebin en geç 3 iş günü içinde incelenir ve sonucu e-posta ile bildirilir.</li>
            <li>
              Onaylanan iadeler, talebin onaylanmasından itibaren <strong>14 gün içinde</strong>{" "}
              ödemenin yapıldığı karta / ödeme yöntemine iade edilir. Bankanın iadeyi hesabına
              yansıtma süresi bankaya göre değişebilir.
            </li>
          </ul>
        </section>
      </main>
      <LegalFooter />
    </>
  );
}
