import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "Mesafeli Satış Sözleşmesi — PlayMyJam" };

export default function MesafeliSatisPage() {
  return (
    <BilingualLegal
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Mesafeli Satış Sözleşmesi</h1>
          <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 15 Temmuz 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Taraflar</h2>
            <p className="text-gray-300 leading-relaxed">
              <strong>SATICI:</strong> {COMPANY.legalName} ({COMPANY.brand})
              <br />
              Adres: {COMPANY.address}, {COMPANY.city}
              <br />
              Telefon: {COMPANY.phone}
              <br />
              E-posta: {COMPANY.email}
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              <strong>ALICI:</strong> PlayMyJam platformu üzerinden jeton satın alan, sipariş
              sırasında hesap bilgileri kayıt altına alınan kullanıcı (&quot;Alıcı&quot;).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Sözleşmenin Konusu</h2>
            <p className="text-gray-300 leading-relaxed">
              İşbu sözleşmenin konusu, Alıcı&apos;nın PlayMyJam web uygulaması üzerinden elektronik
              ortamda sipariş verdiği dijital jeton paketlerinin satışı ve teslimi ile ilgili olarak
              6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği
              hükümleri gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Ürün / Hizmet Bilgileri</h2>
            <p className="text-gray-300 leading-relaxed">
              Satışa konu ürün, PlayMyJam platformunda şarkı isteği göndermek için kullanılan
              dijital jetonlardır. Jeton paketleri, adetleri ve KDV dahil satış fiyatları sipariş
              anında ödeme sayfasında ve{" "}
              <a href="/#fiyatlar" className="text-purple-400 underline">
                fiyatlar bölümünde
              </a>{" "}
              gösterilir. Jetonlar gayri maddi (dijital) mal niteliğindedir; fiziksel teslimat
              yapılmaz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Teslimat</h2>
            <p className="text-gray-300 leading-relaxed">
              Jetonlar, ödemenin onaylanmasının ardından Alıcı&apos;nın PlayMyJam hesabına{" "}
              <strong>anında ve elektronik ortamda</strong> tanımlanır. Teslimat için ayrıca kargo
              veya fiziksel gönderim söz konusu değildir. Teslimat masrafı yoktur.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Ödeme</h2>
            <p className="text-gray-300 leading-relaxed">
              Ödemeler, ödeme sayfasında sunulan kredi kartı / banka kartı seçenekleri ile SSL
              sertifikalı güvenli bağlantı üzerinden alınır. Kart bilgileri Satıcı tarafından
              saklanmaz; ödeme işlemleri lisanslı ödeme kuruluşu altyapısı üzerinden
              gerçekleştirilir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Cayma Hakkı</h2>
            <p className="text-gray-300 leading-relaxed">
              Mesafeli Sözleşmeler Yönetmeliği&apos;nin 15/1-ğ maddesi uyarınca,{" "}
              <strong>elektronik ortamda anında ifa edilen hizmetler ile tüketiciye anında teslim
              edilen gayri maddi mallara ilişkin sözleşmelerde cayma hakkı kullanılamaz.</strong>{" "}
              Jetonlar hesaba anında tanımlandığından, kullanılmaya başlanan paketler için cayma
              hakkı bulunmamaktadır. Bununla birlikte, satın alınan pakete ait jetonların{" "}
              <strong>hiçbiri kullanılmamışsa</strong>, Alıcı satın alma tarihinden itibaren 14 gün
              içinde {COMPANY.email} adresine yazılı talepte bulunarak iade isteyebilir; bedel,
              talebin onaylanmasından itibaren 14 gün içinde ödeme yöntemine iade edilir. Ayrıntılar
              için{" "}
              <a href="/teslimat-iade" className="text-purple-400 underline">
                Teslimat ve İade Şartları
              </a>{" "}
              sayfasına bakınız.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Genel Hükümler</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                Alıcı, sipariş öncesinde ürün bilgilerini, fiyatını ve işbu sözleşmeyi okuduğunu ve
                elektronik ortamda onayladığını kabul eder.
              </li>
              <li>
                Jetonların şarkı isteğine dönüştürülmesi, ilgili mekanın kataloğu ve çalışma
                saatleri ile sınırlıdır; gönderilen istekler mekan yöneticisi tarafından
                reddedilirse harcanan jetonlar Alıcı&apos;nın bakiyesine iade edilir.
              </li>
              <li>Satıcı, jeton paketlerinin fiyatlarını önceden bildirmeksizin değiştirebilir; değişiklik önceki alımları etkilemez.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Uyuşmazlıkların Çözümü</h2>
            <p className="text-gray-300 leading-relaxed">
              İşbu sözleşmeden doğan uyuşmazlıklarda, Ticaret Bakanlığı&apos;nca ilan edilen parasal
              sınırlar dahilinde Alıcı&apos;nın yerleşim yerindeki Tüketici Hakem Heyetleri ile
              Tüketici Mahkemeleri yetkilidir.
            </p>
          </section>
        </main>
      }
      en={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Distance Sales Agreement</h1>
          <p className="text-gray-400 mb-10 text-sm">Last updated: July 15, 2026</p>

          <p className="text-gray-400 mb-8 text-sm italic">
            This English text is an informational translation. In case of any conflict, the Turkish
            version prevails, as required by Turkish consumer protection law.
          </p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Parties</h2>
            <p className="text-gray-300 leading-relaxed">
              <strong>SELLER:</strong> {COMPANY.legalName} ({COMPANY.brand})
              <br />
              Address: {COMPANY.address}, {COMPANY.city}
              <br />
              Phone: {COMPANY.phone}
              <br />
              Email: {COMPANY.email}
            </p>
            <p className="text-gray-300 leading-relaxed mt-3">
              <strong>BUYER:</strong> The user who purchases tokens through the PlayMyJam platform
              and whose account details are recorded at the time of the order (the &quot;Buyer&quot;).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Subject of the Agreement</h2>
            <p className="text-gray-300 leading-relaxed">
              The subject of this agreement is to determine the rights and obligations of the
              parties, in accordance with Turkish Law No. 6502 on the Protection of Consumers and
              the Regulation on Distance Contracts, regarding the sale and delivery of the digital
              token packs ordered electronically by the Buyer through the PlayMyJam web application.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Product / Service Information</h2>
            <p className="text-gray-300 leading-relaxed">
              The product being sold consists of the digital tokens used to submit song requests on
              the PlayMyJam platform. The token packs, their quantities, and their VAT-inclusive
              sale prices are shown at the time of the order on the payment page and in the{" "}
              <a href="/#fiyatlar" className="text-purple-400 underline">
                pricing section
              </a>
              . Tokens are intangible (digital) goods; no physical delivery is made.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Delivery</h2>
            <p className="text-gray-300 leading-relaxed">
              Following payment confirmation, tokens are credited to the Buyer&apos;s PlayMyJam
              account <strong>instantly and electronically</strong>. There is no shipping or
              physical delivery, and no delivery fee is charged.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Payment</h2>
            <p className="text-gray-300 leading-relaxed">
              Payments are collected via the credit card / debit card options offered on the payment
              page over an SSL-certified secure connection. Card details are not stored by the
              Seller; payment transactions are carried out through the infrastructure of a licensed
              payment institution.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Right of Withdrawal</h2>
            <p className="text-gray-300 leading-relaxed">
              Pursuant to Article 15/1-ğ of the Regulation on Distance Contracts,{" "}
              <strong>the right of withdrawal cannot be exercised for contracts concerning services
              performed instantly in electronic form and intangible goods delivered instantly to the
              consumer.</strong>{" "}
              Since tokens are credited to the account instantly, there is no right of withdrawal for
              packs that have started to be used. However, if <strong>none</strong> of the tokens in
              the purchased pack have been used, the Buyer may request a refund within 14 days of the
              purchase date by submitting a written request to {COMPANY.email}; the amount is
              refunded to the payment method within 14 days of the request being approved. See the{" "}
              <a href="/teslimat-iade" className="text-purple-400 underline">
                Delivery and Refund Terms
              </a>{" "}
              page for details.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. General Provisions</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                The Buyer acknowledges that, prior to ordering, they have read and electronically
                approved the product information, its price, and this agreement.
              </li>
              <li>
                Converting tokens into song requests is limited to the relevant venue&apos;s catalog
                and operating hours; if submitted requests are rejected by the venue administrator,
                the spent tokens are refunded to the Buyer&apos;s balance.
              </li>
              <li>The Seller may change token pack prices without prior notice; such changes do not affect prior purchases.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Dispute Resolution</h2>
            <p className="text-gray-300 leading-relaxed">
              For disputes arising from this agreement, the Consumer Arbitration Committees and
              Consumer Courts at the Buyer&apos;s place of residence have jurisdiction, within the
              monetary limits announced by the Ministry of Trade.
            </p>
          </section>
        </main>
      }
    />
  );
}
