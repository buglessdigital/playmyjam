import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni — PlayMyJam" };

// Kayıt ekranındaki zorunlu "Aydınlatma Metni'ni okudum" kutusu buraya bağlanır.
// Gizlilik Politikası'ndan ayrı tutuluyor: KVKK m.10 aydınlatma yükümlülüğü,
// veri sorumlusu kimliği / işleme amaçları / hukuki sebep / haklar başlıklarını
// bu sırayla ister.
export default function KvkkPage() {
  return (
    <BilingualLegal
      hidePayment
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">
            Kişisel Verilerin Korunması Hakkında Aydınlatma Metni
          </h1>
          <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 9 Ağustos 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Veri Sorumlusu</h2>
            <p className="text-gray-300 leading-relaxed">
              6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) uyarınca kişisel
              verileriniz, veri sorumlusu sıfatıyla {COMPANY.legalName} ({COMPANY.brand}) tarafından
              aşağıda açıklanan kapsamda işlenmektedir.
            </p>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-1 mt-3">
              <li>Adres: {COMPANY.address}</li>
              <li>E-posta: {COMPANY.email}</li>
              <li>Telefon: {COMPANY.phone}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. İşlenen Kişisel Veriler</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                <strong>Kimlik ve iletişim verisi:</strong> Kullanıcı adı, e-posta adresi; Google ile
                giriş yapılması hâlinde Google&apos;dan alınan ad ve e-posta adresi.
              </li>
              <li>
                <strong>Müşteri işlem verisi:</strong> Şarkı istekleri, favoriler, jeton bakiyesi ve
                jeton hareketleri, bulunduğunuz mekana ait kuyruk kayıtları.
              </li>
              <li>
                <strong>Finansal veri:</strong> Jeton satın alımında ad, soyad, şehir ve mevzuat
                gereği T.C. kimlik numarası. Kart bilgileri tarafımızca görülmez ve saklanmaz;
                ödeme, lisanslı ödeme kuruluşu iyzico üzerinden alınır.
              </li>
              <li>
                <strong>İşlem güvenliği verisi:</strong> Oturum bilgileri, bildirim aboneliği adresi,
                hizmetin işletilmesi sırasında oluşan kayıtlar.
              </li>
              <li>
                <strong>Pazarlama verisi:</strong> Yalnızca ayrıca onay vermeniz hâlinde, ticari
                elektronik ileti gönderimi için e-posta adresiniz ve onay kaydınız.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. İşleme Amaçları</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>Üyelik kaydınızın oluşturulması ve hesabınızın yönetilmesi.</li>
              <li>Şarkı isteği, kuyruk ve favori özelliklerinin sunulması.</li>
              <li>Jeton satın alma işlemlerinin gerçekleştirilmesi, faturalandırma ve muhasebe.</li>
              <li>Hizmetin güvenliğinin sağlanması, kötüye kullanımın önlenmesi.</li>
              <li>Hukuki yükümlülüklerin yerine getirilmesi ve uyuşmazlıklarda ispat.</li>
              <li>
                Açık rızanız varsa kampanya, tanıtım ve duyuru içerikli ticari elektronik ileti
                gönderilmesi.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Hukuki Sebepler</h2>
            <p className="text-gray-300 leading-relaxed">
              Kişisel verileriniz; sözleşmenin kurulması ve ifası için gerekli olması (KVKK m.5/2-c),
              hukuki yükümlülüğün yerine getirilmesi (m.5/2-ç), bir hakkın tesisi ve korunması
              (m.5/2-e) ve meşru menfaat (m.5/2-f) hukuki sebeplerine dayanılarak işlenir. Ticari
              elektronik ileti gönderimi ise yalnızca açık rızanıza (m.5/1) dayanır ve rızanızı geri
              almanız hâlinde durdurulur.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Toplama Yöntemi</h2>
            <p className="text-gray-300 leading-relaxed">
              Veriler; web uygulaması üzerinden elektronik ortamda, üyelik formu, Google ile giriş,
              ödeme akışı ve hizmet kullanımınız sırasında otomatik ya da kısmen otomatik yollarla
              toplanır.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Aktarım</h2>
            <p className="text-gray-300 leading-relaxed">
              Verileriniz; barındırma ve veritabanı hizmeti aldığımız altyapı sağlayıcıları
              (Supabase, Vercel), e-posta gönderim sağlayıcımız (Resend), ödeme kuruluşu (iyzico) ve
              yasal talep hâlinde yetkili kamu kurumlarıyla, yalnızca hizmetin gerektirdiği ölçüde
              paylaşılır. Altyapı sağlayıcıları yurt dışında bulunabildiğinden, bu kapsamda KVKK
              m.9&apos;a uygun olarak yurt dışına aktarım gerçekleşebilir. Şarkı isteğinizde
              bulunduğunuz mekan, yalnızca kullanıcı adınızı ve isteğinizi görür; e-posta adresiniz
              ve ödeme bilgileriniz mekanla paylaşılmaz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Saklama Süresi</h2>
            <p className="text-gray-300 leading-relaxed">
              Hesap verileriniz üyeliğiniz sürdüğü müddetçe; ödeme ve fatura kayıtları ilgili
              mevzuatın öngördüğü süre (kural olarak 10 yıl) boyunca saklanır. Hesabınızı sildiğinizde
              yasal saklama yükümlülüğü bulunmayan veriler silinir veya anonim hâle getirilir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Haklarınız</h2>
            <p className="text-gray-300 leading-relaxed">
              KVKK m.11 uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse
              bilgi talep etme, işleme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme,
              yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmiş
              verinin düzeltilmesini, silinmesini veya yok edilmesini isteme, bu işlemlerin
              aktarıldığı üçüncü kişilere bildirilmesini isteme, münhasıran otomatik sistemlerle
              analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve
              zararınızın giderilmesini talep etme haklarına sahipsiniz. Taleplerinizi{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>{" "}
              adresine iletebilirsiniz; başvurular en geç 30 gün içinde sonuçlandırılır.
            </p>
          </section>
        </main>
      }
      en={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Personal Data Protection Notice</h1>
          <p className="text-gray-400 mb-10 text-sm">Last updated: 9 August 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Data Controller</h2>
            <p className="text-gray-300 leading-relaxed">
              Under Turkish Law No. 6698 on the Protection of Personal Data (&quot;KVKK&quot;), your
              personal data is processed by {COMPANY.legalName} ({COMPANY.brand}) as data controller,
              within the scope described below.
            </p>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-1 mt-3">
              <li>Address: {COMPANY.address}</li>
              <li>Email: {COMPANY.email}</li>
              <li>Phone: {COMPANY.phone}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Data We Process</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                <strong>Identity and contact data:</strong> Username, email address; and, if you sign
                in with Google, the name and email address received from Google.
              </li>
              <li>
                <strong>Transaction data:</strong> Song requests, favorites, token balance and token
                movements, queue records at the venue you are in.
              </li>
              <li>
                <strong>Financial data:</strong> Name, surname, city and — as required by law —
                national ID number when purchasing tokens. We never see or store card details;
                payments are collected through the licensed payment institution iyzico.
              </li>
              <li>
                <strong>Security data:</strong> Session information, push notification subscription
                endpoint, and records generated while operating the service.
              </li>
              <li>
                <strong>Marketing data:</strong> Only if you separately consent, your email address
                and consent record for commercial electronic messages.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Purposes of Processing</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>Creating your membership and managing your account.</li>
              <li>Providing song request, queue and favorite features.</li>
              <li>Processing token purchases, invoicing and accounting.</li>
              <li>Ensuring service security and preventing abuse.</li>
              <li>Fulfilling legal obligations and establishing proof in disputes.</li>
              <li>
                Sending commercial electronic messages about campaigns and announcements, only with
                your explicit consent.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Legal Grounds</h2>
            <p className="text-gray-300 leading-relaxed">
              Your data is processed on the grounds of necessity for the conclusion and performance of
              a contract (Art. 5/2-c), compliance with a legal obligation (Art. 5/2-ç), establishment
              and protection of a right (Art. 5/2-e) and legitimate interest (Art. 5/2-f). Commercial
              electronic messages rely solely on your explicit consent (Art. 5/1) and stop as soon as
              you withdraw it.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Collection Method</h2>
            <p className="text-gray-300 leading-relaxed">
              Data is collected electronically through the web application — via the sign-up form,
              Google sign-in, the payment flow and your use of the service — by automated or partly
              automated means.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Transfers</h2>
            <p className="text-gray-300 leading-relaxed">
              Your data is shared, only to the extent the service requires, with our infrastructure
              providers (Supabase, Vercel), our email provider (Resend), our payment institution
              (iyzico), and with competent public authorities upon lawful request. As some providers
              are located abroad, transfers abroad may occur in line with Art. 9 of the KVKK. The
              venue you send a request to sees only your username and your request; your email
              address and payment details are not shared with the venue.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Retention</h2>
            <p className="text-gray-300 leading-relaxed">
              Account data is retained while your membership continues; payment and invoice records
              are retained for the period required by law (as a rule, 10 years). When you delete your
              account, data not subject to a statutory retention obligation is deleted or anonymized.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Your Rights</h2>
            <p className="text-gray-300 leading-relaxed">
              Under Art. 11 of the KVKK you have the right to learn whether your personal data is
              processed, to request information about it, to learn the purpose of processing, to know
              the third parties to whom it is transferred at home or abroad, to request rectification,
              erasure or destruction, to request that these actions be notified to third parties, to
              object to results arising from automated analysis, and to claim compensation for damages.
              You may submit requests to{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
              ; applications are answered within 30 days at the latest.
            </p>
          </section>
        </main>
      }
    />
  );
}
