import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company-info";
import BilingualLegal from "@/components/ui/BilingualLegal";

export const metadata: Metadata = { title: "Ticari Elektronik İleti İzni — PlayMyJam" };

// Kayıt ekranındaki ticari ileti kutusu buraya bağlanır. Kutu isteğe bağlıdır:
// 6563 sayılı Kanun ve Ticari İletişim Yönetmeliği m.6 uyarınca onay, hizmetin
// sunulmasının şartı hâline getirilemez ve önceden işaretli gelemez.
export default function CommercialMessagesPage() {
  return (
    <BilingualLegal
      hidePayment
      tr={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Ticari Elektronik İleti Açık Rıza Metni</h1>
          <p className="text-gray-400 mb-10 text-sm">Son güncelleme: 9 Ağustos 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. İzin Verilen İçerik</h2>
            <p className="text-gray-300 leading-relaxed">
              Bu onayı vermeniz hâlinde {COMPANY.legalName} ({COMPANY.brand}); kampanya, indirim,
              yeni mekan duyurusu, etkinlik ve platform yenilikleri hakkında tarafınıza ticari
              elektronik ileti gönderebilir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Gönderim Kanalı</h2>
            <p className="text-gray-300 leading-relaxed">
              İletiler, hesabınıza kayıtlı e-posta adresine ve — bildirimlere izin vermeniz hâlinde —
              tarayıcı bildirimi olarak gönderilir. Hizmetin işleyişine ilişkin zorunlu bilgilendirmeler
              (şarkı isteğinizin çalması, jeton satın alma onayı, şifre sıfırlama gibi) ticari ileti
              değildir; bu onaydan bağımsız olarak gönderilir.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Onayın İsteğe Bağlı Olması</h2>
            <p className="text-gray-300 leading-relaxed">
              Bu onay isteğe bağlıdır. Onay vermemeniz üyeliğinizi, şarkı isteği göndermenizi veya
              jeton satın almanızı hiçbir şekilde engellemez.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Onayın Geri Alınması</h2>
            <p className="text-gray-300 leading-relaxed">
              Onayınızı dilediğiniz an, gerekçe göstermeksizin geri alabilirsiniz: uygulama içindeki
              Ayarlar sayfasından ilgili anahtarı kapatmanız yeterlidir. Ayrıca her iletinin içindeki
              çıkış bağlantısını kullanabilir veya{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>{" "}
              adresine yazabilirsiniz. Talebiniz en geç üç iş günü içinde işleme alınır.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Kayıt</h2>
            <p className="text-gray-300 leading-relaxed">
              Onayınız ve varsa geri alma talebiniz, tarih bilgisiyle birlikte kayıt altına alınır ve
              6563 sayılı Kanun ile Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik
              uyarınca saklanır. Kişisel verilerinizin işlenmesine ilişkin ayrıntılar için{" "}
              <Link href="/kvkk" className="text-purple-400 underline">
                KVKK Aydınlatma Metni
              </Link>
              &apos;ni inceleyebilirsiniz.
            </p>
          </section>
        </main>
      }
      en={
        <main className="max-w-3xl mx-auto px-6 pb-16 pt-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Commercial Electronic Message Consent</h1>
          <p className="text-gray-400 mb-10 text-sm">Last updated: 9 August 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. What You Consent To</h2>
            <p className="text-gray-300 leading-relaxed">
              If you give this consent, {COMPANY.legalName} ({COMPANY.brand}) may send you commercial
              electronic messages about campaigns, discounts, newly added venues, events and platform
              updates.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Channels</h2>
            <p className="text-gray-300 leading-relaxed">
              Messages are sent to the email address registered to your account and — if you allow
              notifications — as browser notifications. Service messages required for the operation of
              the platform (your song starting to play, token purchase confirmations, password resets)
              are not commercial messages and are sent regardless of this consent.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Consent Is Optional</h2>
            <p className="text-gray-300 leading-relaxed">
              This consent is optional. Declining it does not restrict your membership, your ability
              to request songs, or your ability to purchase tokens in any way.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Withdrawing Consent</h2>
            <p className="text-gray-300 leading-relaxed">
              You may withdraw your consent at any time, without giving a reason: simply turn off the
              relevant switch on the in-app Settings page. You can also use the opt-out link in any
              message or write to{" "}
              <a href={`mailto:${COMPANY.email}`} className="text-purple-400 underline">
                {COMPANY.email}
              </a>
              . Requests are processed within three business days at the latest.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Records</h2>
            <p className="text-gray-300 leading-relaxed">
              Your consent, and any withdrawal request, is recorded together with its date and
              retained in accordance with Turkish Law No. 6563 and the Regulation on Commercial
              Communication and Commercial Electronic Messages. For details on how your personal data
              is processed, see the{" "}
              <Link href="/kvkk" className="text-purple-400 underline">
                Personal Data Protection Notice
              </Link>
              .
            </p>
          </section>
        </main>
      }
    />
  );
}
