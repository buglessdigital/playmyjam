import type { Metadata } from "next";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "Gizlilik Politikası — PlayMyJam" };

export default function PrivacyPage() {
  return (
    <BilingualLegal
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Gizlilik Politikası</h1>
          <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 30 Temmuz 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Giriş</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam (&quot;biz&quot;), mekan misafirlerinin şarkı isteği göndermesine ve mekan
              yöneticilerinin gömülü YouTube oynatıcısı üzerinden müzik akışını yönetmesine imkan
              veren PlayMyJam platformunu işletir. Bu Gizlilik Politikası, bilgilerinizi nasıl
              topladığımızı, kullandığımızı ve koruduğumuzu açıklar.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Topladığımız Bilgiler</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                <strong>Hesap verileri:</strong> E-posta adresiniz, kullanıcı adınız, jeton bakiyeniz
                ve jeton işlem geçmişiniz saklanır. Google ile giriş yaptığınızda Google&apos;dan
                yalnızca e-posta adresiniz ve adınız alınır; şifreniz veya diğer Google hesap
                bilgileriniz tarafımıza iletilmez.
              </li>
              <li>
                <strong>Şarkı istekleri:</strong> Gönderdiğiniz istek ve favori verileri (şarkı adı,
                sanatçı, YouTube video kimliği) saklanır.
              </li>
              <li>
                <strong>Ödeme ve fatura bilgileri:</strong> Jeton satın alırken ad, soyad, şehir ve
                mevzuat gereği T.C. kimlik numarası alınır. Kart bilgileriniz hiçbir aşamada
                tarafımızca görülmez veya saklanmaz; ödeme lisanslı ödeme kuruluşu üzerinden alınır.
              </li>
              <li>
                <strong>Bildirim aboneliği:</strong> Bildirimlere izin verdiğinizde tarayıcınızın
                oluşturduğu abonelik adresi saklanır; bu adres kimliğinizi içermez ve yalnızca size
                bildirim göndermek için kullanılır.
              </li>
              <li>
                <strong>Kullanım verileri:</strong> Platformu iyileştirmek için anonimleştirilmiş
                istatistikler toplanabilir.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Bilgilerin Kullanımı</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>Mekan deneyimi içinde şarkı sıralarını göstermek ve yönetmek.</li>
              <li>İstenen şarkıları mekan cihazındaki gömülü YouTube oynatıcısında çalmak.</li>
              <li>Platform performansını ve güvenilirliğini artırmak.</li>
              <li>Ödeme işlemlerini gerçekleştirmek (kart bilgileri tarafımızca saklanmaz; ödemeler lisanslı ödeme kuruluşu üzerinden alınır).</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. YouTube API Hizmetleri</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam, müzik aramak ve video oynatmak için YouTube API Hizmetlerini (YouTube Data
              API ve gömülü YouTube oynatıcısı) kullanır. PlayMyJam&apos;i kullanarak{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                YouTube Hizmet Şartları
              </a>
              &apos;na bağlı olmayı kabul etmiş ve{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                Google Gizlilik Politikası
              </a>
              &apos;nı onaylamış olursunuz. PlayMyJam, YouTube&apos;a hiçbir kişisel kullanıcı
              verisi göndermez; gömülü oynatıcı Google&apos;ın politikalarında açıklandığı şekilde
              kendi çerezlerini kullanabilir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Veri Saklama</h2>
            <p className="text-gray-300 leading-relaxed">
              Hesap verileriniz, hesabınız açık olduğu sürece saklanır. Şarkı isteği geçmişi
              operasyonel amaçlarla en fazla 30 gün saklanabilir. Arama sorguları API kullanımını
              azaltmak için en fazla 30 gün önbelleğe alınır ve bireysel kullanıcılarla
              ilişkilendirilmez. Jeton satın alımlarına ilişkin ödeme ve fatura kayıtları, Vergi Usul
              Kanunu&apos;ndan doğan yükümlülük gereği hesabınızı silseniz dahi yasal saklama süresi
              boyunca muhafaza edilir; bu kayıtlar hesabınızla bağlantısı kesilerek tutulur.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Haklarınız ve Hesabınızın Silinmesi</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              6698 sayılı Kişisel Verilerin Korunması Kanunu&apos;nun 11. maddesi uyarınca; kişisel
              verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme,
              işlenme amacını öğrenme, verilerinizin düzeltilmesini, silinmesini veya yok edilmesini
              isteme ve işlemenin kanuna aykırı olması hâlinde zararınızın giderilmesini talep etme
              haklarına sahipsiniz.
            </p>
            <p className="text-gray-300 leading-relaxed mb-3">
              Hesabınızı dilediğiniz zaman <strong>Ayarlar → Hesabımı Sil</strong> adımlarıyla
              kendiniz silebilirsiniz. İşlem geri alınamaz; profiliniz, kullanıcı adınız, jeton
              bakiyeniz ve işlem geçmişiniz, şarkı istekleriniz, favorileriniz, bildirim aboneliğiniz
              ve giriş bilgileriniz kalıcı olarak kaldırılır. Kullanılmamış jeton bakiyeniz de bu
              işlemle silinir; silme talebinden önce bakiyenizi kullanmanızı öneririz. Yalnızca
              yukarıda belirtilen ödeme ve fatura kayıtları, yasal yükümlülük gereği hesabınızdan
              koparılarak saklanmaya devam eder.
            </p>
            <p className="text-gray-300 leading-relaxed">
              Taleplerinizi aşağıdaki iletişim bilgilerinden bize iletebilirsiniz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Veri Güvenliği</h2>
            <p className="text-gray-300 leading-relaxed">
              Şifreli depolama ve güvenli HTTPS (SSL) bağlantıları dahil olmak üzere endüstri
              standardı güvenlik önlemleri kullanıyoruz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. İletişim</h2>
            <p className="text-gray-300 leading-relaxed">
              Gizlilikle ilgili sorularınız için: {COMPANY.legalName},{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
              , {COMPANY.phone}, {COMPANY.address}, {COMPANY.city}
            </p>
          </section>
        </main>
      }
      en={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-gray-400 mb-10 text-sm">Last updated: July 30, 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the PlayMyJam
              platform, which allows venue guests to request songs and venue administrators to
              manage music playback via the embedded YouTube player. This Privacy Policy explains
              how we collect, use, and protect your information.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>
                <strong>Account data:</strong> We store your email address, username, token balance
                and token transaction history. When you sign in with Google we receive only your
                email address and name; your password and other Google account credentials are never
                shared with us.
              </li>
              <li>
                <strong>Song requests:</strong> We store the song requests and favourites you submit
                (track name, artist, YouTube video ID).
              </li>
              <li>
                <strong>Payment and invoicing data:</strong> When you purchase tokens we collect your
                first name, surname, city and — as required by Turkish law — your national ID number.
                We never see or store your card details; payments are handled by a licensed payment
                provider.
              </li>
              <li>
                <strong>Notification subscription:</strong> If you allow notifications, we store the
                subscription endpoint generated by your browser. It contains no identifying
                information and is used solely to deliver notifications to you.
              </li>
              <li>
                <strong>Usage data:</strong> We may collect anonymized usage statistics to improve
                the platform.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
            <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
              <li>To display and manage song queues within the venue experience.</li>
              <li>To play requested songs through the embedded YouTube player on the venue device.</li>
              <li>To improve platform performance and reliability.</li>
              <li>To process payments (we do not store card details; payments are handled by a licensed payment provider).</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. YouTube API Services</h2>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam uses YouTube API Services (YouTube Data API and the YouTube embedded player)
              to search for music and play videos. By using PlayMyJam you agree to be bound by the{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                YouTube Terms of Service
              </a>{" "}
              and acknowledge the{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                Google Privacy Policy
              </a>
              . PlayMyJam does not send any personal user data to YouTube; the embedded player may
              set its own cookies as described in Google&apos;s policies.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
            <p className="text-gray-300 leading-relaxed">
              Your account data is retained for as long as your account exists. Song request history
              may be retained for up to 30 days for operational purposes. Search queries are cached
              for up to 30 days to reduce API usage; they are not linked to individual users. Payment
              and invoicing records for token purchases are retained for the statutory period
              required by Turkish tax law even if you delete your account; those records are kept
              detached from your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Your Rights and Account Deletion</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              Under Article 11 of Turkish Personal Data Protection Law No. 6698 (KVKK) you have the
              right to learn whether your personal data is being processed, to request information
              about such processing and its purpose, to request correction, deletion or destruction of
              your data, and to seek compensation for damages arising from unlawful processing.
            </p>
            <p className="text-gray-300 leading-relaxed mb-3">
              You can delete your account yourself at any time via{" "}
              <strong>Settings → Delete My Account</strong>. The action cannot be undone: your
              profile, username, token balance and transaction history, song requests, favourites,
              notification subscription and login credentials are permanently removed. Any unused
              token balance is deleted as well, so we recommend spending your balance before
              requesting deletion. Only the payment and invoicing records described above continue to
              be stored, detached from your account, as required by law.
            </p>
            <p className="text-gray-300 leading-relaxed">
              You can submit any such request using the contact details below.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Data Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We use industry-standard security measures including encrypted storage and secure
              HTTPS connections.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
            <p className="text-gray-300 leading-relaxed">
              For privacy-related inquiries, contact us at: {COMPANY.legalName},{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
              , {COMPANY.phone}, {COMPANY.address}, {COMPANY.city}
            </p>
          </section>
        </main>
      }
    />
  );
}
