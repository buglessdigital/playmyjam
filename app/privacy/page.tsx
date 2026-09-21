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
          <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 21 Eylül 2026</p>

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
                Ödeme formunda kartınızı saklatmayı seçerseniz kart iyzico&apos;da saklanır; bize
                yalnızca kart numarası içermeyen bir anahtar iletilir.
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

          {/* Google OAuth kapsam doğrulaması bu bölümü şart koşuyor: gizlilik politikası,
              istenen her Google kullanıcı verisi kapsamını ve Sınırlı Kullanım taahhüdünü
              açıkça yazmalı (Google API Services User Data Policy). */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Google Hesabı Verileri ve Sınırlı Kullanım</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              Mekan yöneticileri, yönetim paneline Google hesaplarıyla giriş yapabilir. Bu girişte
              Google&apos;dan yalnızca <strong>temel profil bilgileri</strong> (ad ve e-posta
              adresi) alınır; bunlar yönetici hesabını oluşturmak ve güvenliğini sağlamak için
              kullanılır.
            </p>
            <p className="text-gray-300 leading-relaxed mb-3">
              Bir mekan kendi YouTube çalma listelerini panele aktarmak isterse, ek olarak{" "}
              <code className="text-purple-300">
                https://www.googleapis.com/auth/youtube.readonly
              </code>{" "}
              kapsamıyla o hesabın YouTube çalma listelerine <strong>yalnızca okuma izni</strong>{" "}
              istenir. Bu izin tek bir amaçla kullanılır: yöneticinin seçtiği çalma listelerinin
              adlarını ve içerdikleri videoları okuyup mekanın PlayMyJam kataloğuna kopyalamak.
              YouTube hesabınızda hiçbir değişiklik yapılmaz; video veya liste oluşturulmaz,
              düzenlenmez, silinmez ve hiçbir içerik yüklenmez. İzin isteğe bağlıdır: vermezseniz
              panelin diğer tüm özellikleri çalışmaya devam eder ve listelerinizi bağlantı
              yapıştırarak da aktarabilirsiniz.
            </p>
            <p className="text-gray-300 leading-relaxed mb-3">
              Bu izinle alınan Google erişim jetonu <strong>veritabanımıza kaydedilmez</strong>;
              yalnızca tarayıcınızdaki güvenli (httpOnly) bir çerezte, yaklaşık bir saat boyunca
              tutulur ve süre dolduğunda kendiliğinden geçersiz olur. Aktarım sonucunda saklanan tek
              veri, mekanın kataloğuna eklenen şarkıların herkese açık bilgileridir (çalma listesi
              adı, video kimliği, şarkı ve sanatçı adı); bu veriler kişisel veri içermez. Verdiğiniz
              izni dilediğiniz zaman{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                Google Hesabım → Üçüncü taraf uygulamalar
              </a>{" "}
              sayfasından geri alabilirsiniz.
            </p>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam&apos;in Google API&apos;lerinden aldığı bilgileri kullanması ve başka
              uygulamalara aktarması,{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                Google API Hizmetleri Kullanıcı Verileri Politikası
              </a>
              &apos;na, bu politikanın <strong>Sınırlı Kullanım (Limited Use)</strong> şartları dahil
              olmak üzere, uygundur. Google&apos;dan alınan veriler reklam amacıyla kullanılmaz,
              satılmaz, üçüncü taraflara devredilmez ve bir insan tarafından okunmaz; yalnızca
              kullanıcının açıkça talep ettiği aktarma işlemini gerçekleştirmek için işlenir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Veri Saklama</h2>
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
            <h2 className="text-xl font-semibold mb-3">7. Haklarınız ve Hesabınızın Silinmesi</h2>
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
            <h2 className="text-xl font-semibold mb-3">8. Veri Güvenliği</h2>
            <p className="text-gray-300 leading-relaxed">
              Şifreli depolama ve güvenli HTTPS (SSL) bağlantıları dahil olmak üzere endüstri
              standardı güvenlik önlemleri kullanıyoruz.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">9. İletişim</h2>
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
          <p className="text-gray-400 mb-10 text-sm">Last updated: September 21, 2026</p>

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
                provider. If you choose to save your card on the payment form, it is stored by
                iyzico; we receive only a key that contains no card number.
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
            <h2 className="text-xl font-semibold mb-3">5. Google Account Data and Limited Use</h2>
            <p className="text-gray-300 leading-relaxed mb-3">
              Venue administrators can sign in to the management dashboard with their Google
              account. During this sign-in we receive only <strong>basic profile information</strong>{" "}
              (name and email address), which is used to create and secure the administrator
              account.
            </p>
            <p className="text-gray-300 leading-relaxed mb-3">
              If a venue chooses to import its own YouTube playlists into the dashboard, we
              additionally request the{" "}
              <code className="text-purple-300">
                https://www.googleapis.com/auth/youtube.readonly
              </code>{" "}
              scope, which grants <strong>read-only access</strong> to that account&apos;s YouTube
              playlists. We use it for a single purpose: to read the names of the playlists the
              administrator selects and the videos they contain, and to copy them into the
              venue&apos;s PlayMyJam catalog. Nothing in your YouTube account is changed — we never
              create, edit or delete videos or playlists, and we never upload any content. Granting
              the permission is optional: every other dashboard feature keeps working without it,
              and playlists can also be imported by pasting a link.
            </p>
            <p className="text-gray-300 leading-relaxed mb-3">
              The Google access token issued for this permission is{" "}
              <strong>never written to our database</strong>. It is held only in a secure (httpOnly)
              cookie in your browser for about one hour and expires automatically. The only data
              retained from an import is the publicly available information of the songs added to
              the venue catalog (playlist name, video ID, track and artist name), which contains no
              personal data. You can revoke the permission at any time from{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                your Google Account → Third-party apps
              </a>
              .
            </p>
            <p className="text-gray-300 leading-relaxed">
              PlayMyJam&apos;s use and transfer of information received from Google APIs to any other
              app will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 underline"
              >
                Google API Services User Data Policy
              </a>
              , including the <strong>Limited Use</strong> requirements. Data received from Google is
              not used for advertising, is not sold or transferred to third parties, and is not read
              by humans; it is processed solely to perform the import the user explicitly requested.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Data Retention</h2>
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
            <h2 className="text-xl font-semibold mb-3">7. Your Rights and Account Deletion</h2>
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
            <h2 className="text-xl font-semibold mb-3">8. Data Security</h2>
            <p className="text-gray-300 leading-relaxed">
              We use industry-standard security measures including encrypted storage and secure
              HTTPS connections.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">9. Contact</h2>
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
