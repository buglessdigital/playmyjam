import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import LegalFooter from "@/components/ui/LegalFooter";

export const metadata: Metadata = { title: "Mesafeli Satış Sözleşmesi — PlayMyJam" };

export default function MesafeliSatisPage() {
  return (
    <>
      <main className="max-w-3xl mx-auto px-6 py-16 text-white">
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
      <LegalFooter />
    </>
  );
}
