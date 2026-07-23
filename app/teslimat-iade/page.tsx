import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "Teslimat ve İade Şartları — PlayMyJam" };

export default function TeslimatIadePage() {
  return (
    <BilingualLegal
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
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
      }
      en={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Delivery and Refund Terms</h1>
          <p className="text-gray-400 mb-10 text-sm">Last updated: July 15, 2026</p>

          <p className="text-gray-400 mb-8 text-sm italic">
            This English text is an informational translation. In case of any conflict, the Turkish
            version prevails, as required by Turkish consumer protection law.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Delivery</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                Purchased tokens are a digital product; they are loaded to your account{" "}
                <strong>automatically and instantly</strong> the moment payment is confirmed.
              </li>
              <li>There is no physical shipping or delivery process, and no delivery fee is charged.</li>
              <li>
                You can see your token balance in real time on the app&apos;s &quot;Buy Tokens&quot;
                page and in your transaction history.
              </li>
              <li>
                If your payment is confirmed but the tokens are not loaded to your account, simply
                email {COMPANY.email}; the transaction will be checked and corrected within 24 hours
                at the latest.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Refund Conditions</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                Since tokens are an instantly delivered digital product, there is no right of
                withdrawal for <strong>packs that have started to be used</strong>, pursuant to
                Article 15/1-ğ of the Regulation on Distance Contracts.
              </li>
              <li>
                If <strong>none</strong> of the tokens in the pack have been used, you may request a
                refund within 14 days of the purchase date.
              </li>
              <li>
                If your song request is <strong>rejected</strong> by the venue, the spent tokens are
                automatically refunded to your balance.
              </li>
              <li>
                If a double charge or incorrect load occurs due to a technical error, the excess
                amount is refunded unconditionally.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Refund Process</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                Send your refund request, together with the account details you used at the time of
                purchase, to{" "}
                <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                  {COMPANY.email}
                </a>
                .
              </li>
              <li>Your request is reviewed within 3 business days at the latest and the result is notified by email.</li>
              <li>
                Approved refunds are returned to the card / payment method used, <strong>within 14
                days</strong> of the request being approved. The time for the bank to reflect the
                refund to your account may vary by bank.
              </li>
            </ul>
          </section>
        </main>
      }
    />
  );
}
