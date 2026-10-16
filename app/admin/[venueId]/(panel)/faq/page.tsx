import DynamicMetadataMarker from "@/components/admin/DynamicMetadataMarker";

// Mekan adminlerinin en sık karşılaştığı durumlar ve çözümleri. İçerik sabit,
// istemci kodu yok: açılır kapanır satırlar <details> ile. İşaretçi için bkz.
// components/admin/DynamicMetadataMarker.tsx

type Faq = { q: string; a: React.ReactNode };

const faqs: Faq[] = [
  {
    q: "Şarkılar 2-3 saniye çalıp sonrakine geçiyor, ekranda \"Planınızda aynı anda çok fazla cihazda içerik izlendiğinden oynatma duraklatıldı\" yazıyor",
    a: (
      <>
        <p>
          Bu mesaj YouTube&apos;un kendisinden gelir. Müziği çalan tarayıcıda bir YouTube Premium (veya aile planı)
          hesabı açık ve aynı hesap şu anda başka bir yerde de (telefon, TV, başka bir bilgisayar) video oynatıyor.
          YouTube eşzamanlı cihaz sınırına takılıp videoyu durduruyor, PlayMyJam de durmuş şarkıyı atlıyor.
        </p>
        <p className="mt-2">Çözüm:</p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>O hesapla başka yerlerde açık YouTube oturumlarını kapatın, ya da</li>
          <li>
            Müziği çalan tarayıcıda YouTube&apos;dan çıkış yapın veya Google hesabı açık olmayan ayrı bir tarayıcı
            profili kullanın. (Önerilen: mekandaki player için kişisel hesap kullanmayın.)
          </li>
        </ul>
      </>
    ),
  },
  {
    q: "Panel açık ama müzik başlamıyor",
    a: (
      <p>
        Tarayıcılar sesli oynatmayı ancak sayfaya bir kez dokunulduktan sonra başlatır. Panel ilk açıldığında alttaki
        oynat düğmesine bir kez basın (TV modunda &quot;Başlat&quot;). Sayfayı yeniledikten veya bilgisayarı yeniden
        başlattıktan sonra da aynısı gerekir.
      </p>
    ),
  },
  {
    q: "Telefondan paneli açtım ama müzik telefonda çalmıyor",
    a: (
      <p>
        Bu bilerek böyle: telefonda panel bir kumanda gibi çalışır, müzik mekandaki bilgisayarda/TV&apos;de çalmaya
        devam eder. Telefondan oynat, durdur, geç ve ses ayarı yapabilirsiniz. Müziği gerçekten telefondan çalmak
        isterseniz alttaki &quot;Bu cihazda çal&quot; düğmesini kullanın.
      </p>
    ),
  },
  {
    q: "Müzik bir süre sonra kesiliyor, player penceresine geçince hemen devam ediyor",
    a: (
      <p>
        Bilgisayar uykuya geçiyor ya da tarayıcı arka plandaki pencereyi kısıyor olabilir. Müziği çalan bilgisayarda
        uyku/ekran koruyucuyu kapatın, pil tasarrufu modunu kapatın ve player penceresini simge durumuna küçültmeyin.
        Mümkünse müziği çalan bilgisayarı yalnızca bu iş için kullanın.
      </p>
    ),
  },
  {
    q: "Müşteriler şarkı ekleyemiyor, ekranlarında \"Oynatıcı kapalı\" yazıyor",
    a: (
      <p>
        Müzik çalan cihaz yaklaşık 45 saniyedir PlayMyJam&apos;e ulaşamıyor: panel kapanmış, bilgisayar uyumuş ya da
        internet kopmuş olabilir. Bu sırada eklenen şarkı çalınamayacağı için müşteri jetonu harcanmasın diye ekleme
        kapanır. Paneli açıp müziği başlattığınızda kendiliğinden düzelir.
      </p>
    ),
  },
  {
    q: "Müşteriler şarkı ekleyemiyor, ekranlarında \"Sıra kapalı\" yazıyor",
    a: (
      <p>
        Ana ekranda &quot;Sırada&quot; bölümündeki &quot;Müşteriler şarkı ekleyebilir&quot; anahtarı kapalı olabilir.
        Bu anahtar kapanışa yakın eklemeleri durdurmak içindir; kapatırsanız 12 saat sonra kendiliğinden açılır.
      </p>
    ),
  },
  {
    q: "Bir şarkı sıraya tekrar eklenemiyor",
    a: (
      <p>
        Şu an çalan şarkı sıraya tekrar eklenemez. Müşteri isteğiyle çalan bir şarkı da çalmaya başladığı andan
        itibaren 30 dakika boyunca tekrar eklenemez. Böylece aynı şarkı art arda çalmaz.
      </p>
    ),
  },
  {
    q: "Bazı şarkılar hiç çalmadan atlanıyor ya da listeden kayboldu",
    a: (
      <p>
        Şarkının sahibi YouTube&apos;da başka sitelerde oynatılmasını kapatmış veya video kaldırılmış olabilir. Bu
        şarkılar otomatik olarak atlanır ve listelerden çıkarılır. Aynı şarkının başka bir yüklemesini (ör. sanatçının
        resmi kanalından) ekleyebilirsiniz.
      </p>
    ),
  },
  {
    q: "Ses kaydırıcısı iPhone/iPad'de çalan müziğin sesini değiştirmiyor",
    a: (
      <p>
        iOS, web sayfalarının ses seviyesini değiştirmesine izin vermez. Müzik bir iPhone/iPad&apos;de çalıyorsa sesi
        cihazın kendi tuşlarından ayarlayın. Bilgisayarda çalan müzikte kaydırıcı normal çalışır.
      </p>
    ),
  },
  {
    q: "Müşteri listede olmayan bir şarkı istedi, ne yapmalıyım?",
    a: (
      <p>
        Talep &quot;İstekler&quot; sayfasına düşer (bildirimleri açtıysanız telefonunuza da gelir). Onaylarsanız
        müşteri 10 dakika içinde o şarkıyı sıraya ekleyebilir. 10 dakika içinde karar vermezseniz talep kendiliğinden
        kapanır. Onaylanan şarkı kataloğunuza ve listelerinize eklenmez.
      </p>
    ),
  },
  {
    q: "İki ayrı yerde panel açtım, müzik hangisinde çalar?",
    a: (
      <p>
        Müzik aynı anda yalnızca bir cihazda çalar. İkinci cihazda &quot;Player başka bir cihazda/sekmede açık&quot;
        uyarısı çıkar; &quot;Yine de Buradan Çal&quot;a basarsanız müzik o cihaza geçer, öteki susar. Mekanda müziği
        tek bir bilgisayarın/TV&apos;nin çalmasını sağlayın, diğer cihazları kumanda olarak kullanın.
      </p>
    ),
  },
  {
    q: "Çapraz geçiş (crossfade) bazen olmuyor",
    a: (
      <p>
        Çapraz geçiş yalnızca şarkı kendi sonuna geldiğinde yapılır. &quot;Geç&quot; tuşuyla atladığınızda ve
        müzik telefonda çalarken geçiş olmaz; bu beklenen davranıştır.
      </p>
    ),
  },
];

export default function Page() {
  return (
    <>
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-white">Sık Sorulanlar</h1>
          <p className="text-[#6b7280] text-sm mt-1">Sık karşılaşılan durumlar ve çözümleri</p>
        </div>
        <div className="flex flex-col gap-2">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-white/10 bg-white/[0.03] open:bg-white/[0.05]"
            >
              <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 text-sm font-medium text-white [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{f.q}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="mt-0.5 shrink-0 transition-transform group-open:rotate-180"
                >
                  <path d="M6 9l6 6 6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="px-4 pb-4 text-sm leading-relaxed text-[#c4c4cc]">{f.a}</div>
            </details>
          ))}
        </div>
      </div>
      <DynamicMetadataMarker />
    </>
  );
}
