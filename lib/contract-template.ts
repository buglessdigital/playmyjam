// Mekanla yapılması gereken belge seti. Sözleşme koşulları (komisyon, ödeme günü,
// fatura/banka/iletişim bilgisi) eksiksiz girildiğinde sunucu bu setin tamamını
// üretip mekana onaya gönderir (bkz. syncVenueDocuments). Hukuki inceleme yerine geçmez.
//
// Belge türü ayrı bir kolonda değil, başlığın sonekinde tutulur
// ("{Mekan} — PlayMyJam {Belge adı}"); documentKindOf bu soneki okur.

import { COMPANY } from "./company-info.ts";
import { formatNumber, type PayoutSettings } from "./business.ts";

export type ContractFields = {
  commission_pct: number;
  payment_day: number;
  start_date: string | null;
  end_date: string | null;
  legal_name: string;
  tax_office: string;
  tax_number: string;
  iban: string;
  account_holder: string;
  billing_email: string;
  contact_name: string;
  contact_phone: string;
  notes: string;
};

type TemplateInput = {
  venueName: string;
  contract: ContractFields | null;
  settings: PayoutSettings;
  unitPrice: number;
};

export const DOCUMENT_KINDS = [
  { kind: "service", title: "Hizmet ve Gelir Paylaşım Sözleşmesi" },
  { kind: "kvkk", title: "Kişisel Verilerin Korunması ve Gizlilik Protokolü" },
  { kind: "music", title: "Müzik Lisansı ve Tazmin Taahhütnamesi" },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["kind"];

const suffix = (title: string) => `${COMPANY.brand} ${title}`;

export function documentKindOf(title: string): DocumentKind | null {
  return DOCUMENT_KINDS.find((d) => title.endsWith(suffix(d.title)))?.kind ?? null;
}

// Belgelerin otomatik oluşması için dolu olması gereken koşullar.
// Bitiş tarihi (boşsa süresiz) ve özel şartlar isteğe bağlı.
const REQUIRED: [keyof ContractFields, string][] = [
  ["commission_pct", "Mekan komisyonu"],
  ["payment_day", "Ödeme günü"],
  ["start_date", "Sözleşme başlangıcı"],
  ["legal_name", "Ticari unvan"],
  ["tax_office", "Vergi dairesi"],
  ["tax_number", "Vergi / TC no"],
  ["billing_email", "Fatura e-postası"],
  ["iban", "IBAN"],
  ["account_holder", "Hesap sahibi"],
  ["contact_name", "Muhatap"],
  ["contact_phone", "Telefon"],
];

export function missingContractFields(c: Partial<Record<keyof ContractFields, unknown>> | null): string[] {
  if (!c) return REQUIRED.map(([, label]) => label);
  return REQUIRED.filter(([key]) => {
    const v = c[key];
    if (key === "commission_pct" || key === "payment_day") return !(Number(v) > 0);
    return typeof v !== "string" || !v.trim();
  }).map(([, label]) => label);
}

const blank = (v: string | null | undefined, placeholder: string) => (v && v.trim() ? v.trim() : placeholder);

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }) : null;

const groupIban = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

function parties(venueName: string, c: ContractFields | null) {
  return `${COMPANY.brand} / Hizmet Sağlayıcı: ${COMPANY.legalName} (“${COMPANY.brand}”)
     Adres: ${COMPANY.address}
     E-posta: ${COMPANY.email} · Telefon: ${COMPANY.phone}

Mekan: ${blank(c?.legal_name, "[TİCARİ UNVAN]")} (“Mekan”)
     İşletme adı: ${venueName}
     Vergi dairesi / no: ${blank(c?.tax_office, "[VERGİ DAİRESİ]")} / ${blank(c?.tax_number, "[VERGİ NO]")}
     Yetkili / muhatap: ${blank(c?.contact_name, "[MUHATAP]")} · Telefon: ${blank(c?.contact_phone, "[TELEFON]")}
     E-posta: ${blank(c?.billing_email, "[E-POSTA]")}`;
}

function approval(docName: string) {
  return `Mekan yetkilisi, bu ${docName} ${COMPANY.brand} mekan paneli üzerinden elektronik olarak onaylar ve Mekan'ı temsile yetkili olduğunu beyan eder. Onay anında onaylayan kullanıcı, tarih, IP adresi, tarayıcı bilgisi ve metnin SHA-256 özeti kayıt altına alınır. Taraflar, bu kaydın HMK md. 193 uyarınca aralarında kesin delil niteliğinde olduğunu kabul eder. Taraflardan biri ayrıca ıslak imzalı nüsha talep edebilir; bu durumda ıslak imzalı nüsha elektronik onaylı metinle aynı içerikte düzenlenir.`;
}

function serviceContract({ venueName, contract: c, settings, unitPrice }: TemplateInput): string {
  const commission = c ? `%${formatNumber(Number(c.commission_pct))}` : "%[KOMİSYON]";
  const payDay = c ? String(c.payment_day) : "[GÜN]";
  const start = day(c?.start_date ?? null) ?? "[BAŞLANGIÇ TARİHİ]";
  const term = c?.end_date
    ? `${day(c.end_date)} tarihine kadar geçerlidir. Taraflardan biri bitiş tarihinden en az 30 gün önce yazılı olarak aksini bildirmedikçe sözleşme aynı koşullarla birer yıllık sürelerle kendiliğinden uzar`
    : "süresizdir. Taraflardan her biri 30 gün önceden yazılı bildirimde bulunarak sözleşmeyi feshedebilir";
  const deductions = [
    `KDV (%${formatNumber(settings.vat_rate)})`,
    `ödeme kuruluşu / banka komisyonu (%${formatNumber(settings.bank_fee_pct)})`,
    settings.other_pct > 0 ? `diğer yasal kesintiler (%${formatNumber(settings.other_pct)})` : "varsa diğer yasal kesintiler",
  ].join(", ");
  const special = c?.notes?.trim()
    ? `\n\n17. ÖZEL ŞARTLAR\n\n${c.notes.trim()}\n\nÖzel şartlar ile bu sözleşmenin diğer hükümleri çelişirse özel şartlar uygulanır.`
    : "";
  const n = special ? [18, 19] : [17, 18];

  return `1. TARAFLAR

${parties(venueName, c)}

2. TANIMLAR

Platform: ${COMPANY.brand} web uygulaması, mekan paneli, müzik oynatıcı ve bunlara bağlı tüm yazılım ve hizmetler.
Müşteri: Mekan'ı ziyaret eden ve Platform'u kullanan gerçek kişi.
Jeton: Müşterinin Platform'da şarkı istemek için kullandığı, ${COMPANY.brand} tarafından satılan dijital hizmet birimi.
Ücretli Jeton: Müşterinin bedelini ödeyerek satın aldığı jeton. ${COMPANY.brand}'ın hediye, promosyon, telafi ya da test amacıyla ücretsiz verdiği jetonlar Ücretli Jeton sayılmaz.
Dönem: Bir takvim ayı (Türkiye saati ile ayın ilk günü 00:00 ile son günü 23:59 arası).

3. KONU

Bu sözleşme, Platform'un Mekan'da kullanılmasına, Müşterilerin Platform üzerinden jeton harcayarak Mekan'da çalacak şarkıları istemesine ve ${COMPANY.brand}'ın bu kullanım karşılığında Mekan'a ödeyeceği iş ortaklığı bedelinin (“Hakediş”) belirlenmesine ilişkin koşulları düzenler.

4. JETON SATIŞI VE TAHSİLAT

4.1. Jeton ${COMPANY.brand}'ın kendi hizmet ürünüdür. Jeton satışı ${COMPANY.brand} adına ve hesabına yapılır; bedeli ${COMPANY.brand} tarafından, anlaşmalı ödeme kuruluşu aracılığıyla tahsil edilir ve Müşteriye ${COMPANY.brand} tarafından belge düzenlenir.
4.2. Mekan, jeton ya da şarkı isteği için Müşteriden doğrudan bedel tahsil etmez ve jeton satışı yapmaz.
4.3. Hakediş, Müşteri adına tahsil edilip Mekan'a aktarılan bir tutar değildir. Hakediş, Platform'un Mekan'da sunulmasına imkân tanınması ve Mekan'ın 7. maddedeki yükümlülükleri karşılığında ${COMPANY.brand}'ın kendi gelirinden Mekan'a ödediği bedeldir.
4.4. Jeton birim fiyatını ${COMPANY.brand} belirler. Sözleşme tarihindeki birim fiyat ${formatNumber(unitPrice)} TL'dir (KDV dahil). Fiyat değişiklikleri yürürlükten en az 7 gün önce Mekan'a bildirilir.
4.5. Müşterinin jeton satın alma, iade ve kullanım ilişkisi yalnızca ${COMPANY.brand} ile Müşteri arasındadır. Kullanılmamış jetonlara ilişkin tüm sorumluluk ${COMPANY.brand}'a aittir.

5. HAKEDİŞ

5.1. Ciro: Bir Dönem içinde Mekan'da harcanan Ücretli Jeton adedi × harcama anındaki jeton birim fiyatıdır.
5.2. Net ciro: Cirodan ${deductions} düşüldükten sonra kalan tutardır.
5.3. Mekan'ın Hakedişi, net cironun ${commission}'idir.
5.4. Müşteriye iade edilen ya da kart sahibinin itirazı (ters ibraz) sonucu geri alınan ödemelere karşılık gelen jetonlar ciroya dahil edilmez. Bu jetonlar için Hakediş ödenmişse ödenen tutar izleyen Dönem Hakedişlerinden mahsup edilir.
5.5. Kesinti oranları yasal düzenleme ya da ödeme kuruluşu kaynaklı olarak değişirse yeni oranlar değişikliği izleyen Dönemden itibaren uygulanır ve Mekan'a bildirilir.
5.6. Platform kayıtlarında teknik bir hata nedeniyle yanlış hesaplanan Hakediş, hata tespit edildiğinde izleyen Dönemde düzeltilir.

6. ÖDEME VE FATURA

6.1. Hakediş Dönem sonunda hesaplanır ve Dönemi izleyen ayın ${payDay}. günü aşağıdaki hesaba ödenir. Bu gün resmî tatile denk gelirse ödeme izleyen ilk iş günü yapılır.
     IBAN: ${c?.iban ? groupIban(c.iban) : "[IBAN]"}
     Hesap sahibi: ${blank(c?.account_holder, "[HESAP SAHİBİ]")}
6.2. Ödeme yalnızca Mekan adına ya da Mekan'ın ticari unvanına kayıtlı hesaba yapılır; üçüncü kişi hesabına ödeme yapılmaz. Hesap değişikliği ancak Mekan'ın yazılı bildirimi ve bu değişikliği içeren güncel sözleşmenin onaylanmasıyla geçerli olur.
6.3. Mekan, Hakediş tutarı için mevzuata uygun fatura düzenleyerek ${COMPANY.email} adresine iletir. Fatura, Hakediş dökümüyle birlikte ödemenin ön koşuludur; faturanın gecikmesi hâlinde ödeme günü fatura tarihinden itibaren işler.
6.4. Hakediş dökümü ${COMPANY.brand} mekan paneli ve/veya ${blank(c?.billing_email, "[E-POSTA]")} adresi üzerinden Mekan'a iletilir. Mekan, dökümdeki itirazını tebliğden itibaren 15 gün içinde yazılı olarak bildirir; bu süre içinde itiraz edilmeyen döküm kesinleşir.
6.5. Toplam Hakedişi 100 TL'nin altında kalan Dönemin tutarı izleyen Dönemin Hakedişine eklenerek ödenebilir.
6.6. ${COMPANY.brand}, bu sözleşmeden doğan alacaklarını (5.4. maddedeki mahsuplar ve Müzik Lisansı ve Tazmin Taahhütnamesi'nden doğan rücu alacakları dahil) Mekan'ın Hakedişinden takas ve mahsup edebilir.

7. TARAFLARIN YÜKÜMLÜLÜKLERİ

7.1. ${COMPANY.brand}; Platform'u makul özenle çalışır durumda tutar, Müşteri ödemelerinin güvenli tahsilini sağlar, Mekan'a panel üzerinden kullanım ve Hakediş raporları sunar ve Mekan'ın destek taleplerini makul sürede yanıtlar.
7.2. Mekan; Platform'un çalışması için gerekli cihaz, ekran, ses sistemi ve internet bağlantısını kendi giderleriyle sağlar ve çalışır durumda tutar.
7.3. Mekan, Platform'a ait QR kodları ve tanıtım materyallerini Müşterilerin kolayca görebileceği yerlerde bulundurur ve açık olduğu saatlerde Platform oynatıcısını çalışır tutmaya özen gösterir.
7.4. Mekan, Müşterilere Platform'a ilişkin yanıltıcı bilgi vermez; çalışanlarının Platform'u bu sözleşmeye uygun kullanmasını sağlar.
7.5. Mekan, panel kullanıcı adı ve şifrelerini gizli tutar ve yalnızca yetkili çalışanlarıyla paylaşır; hesabıyla yapılan işlemlerden sorumludur. Yetkisiz kullanım şüphesini derhal ${COMPANY.brand}'a bildirir.
7.6. Mekan, işletmesinin faaliyetine ilişkin tüm izin ve ruhsatların kendisinde bulunduğunu ve Platform'u yürürlükteki mevzuata aykırı biçimde kullanmayacağını kabul eder.

8. MÜZİK İÇERİĞİ VE LİSANSLAR

Platform, Mekan'ın kendi ses sisteminde çalınacak şarkıların istenmesini ve sıralanmasını sağlayan bir araçtır; ${COMPANY.brand} Mekan'a eserlerin umuma iletimi ya da temsili için lisans vermez. İşletmede müzik kullanımı için gerekli izinler ve bunlara ilişkin sorumluluk, bu sözleşmenin eki olan Müzik Lisansı ve Tazmin Taahhütnamesi'nde düzenlenmiştir.

9. MARKA VE TANITIM

9.1. Mekan, ${COMPANY.brand}'a işletme adını ve logosunu Platform içinde ve sözleşme süresince ${COMPANY.brand}'ın tanıtım faaliyetlerinde (web sitesi, sosyal medya, referans listeleri) kullanma iznini ücretsiz olarak verir.
9.2. ${COMPANY.brand}, Mekan'a ${COMPANY.brand} adını, logosunu ve QR materyallerini yalnızca Platform'un Mekan'da tanıtılması amacıyla kullanma iznini ücretsiz olarak verir.
9.3. Bu izinler sözleşmenin sona ermesiyle kendiliğinden sona erer. Taraflar karşı tarafın markasını onu kötüleyecek ya da yanıltıcı biçimde kullanamaz.

10. HİZMET SÜREKLİLİĞİ VE SORUMLULUK

10.1. Platform; müzik içerik sağlayıcıları (YouTube dahil), ödeme kuruluşları, barındırma ve internet hizmet sağlayıcıları gibi üçüncü taraf hizmetlere bağlı çalışır. Bu hizmetlerdeki kesinti, değişiklik ya da içerik kaldırılması ile Mekan'ın cihaz, ses sistemi veya internet bağlantısından kaynaklanan aksaklıklar ${COMPANY.brand}'ın kusuru sayılmaz.
10.2. ${COMPANY.brand}, planlı bakım ve güncellemeler için Platform'u geçici olarak durdurabilir; mümkün olduğunca Mekan'ın yoğun saatleri dışında yapar.
10.3. Taraflar, dolaylı zararlardan ve yoksun kalınan kârdan birbirine karşı sorumlu değildir.
10.4. ${COMPANY.brand}'ın bu sözleşmeden doğan toplam sorumluluğu, zarara yol açan olaydan önceki son 3 Dönemde Mekan'a ödenen Hakedişler toplamı ile sınırlıdır.
10.5. 10.3 ve 10.4. maddelerdeki sınırlamalar kast ve ağır ihmal hâllerinde uygulanmaz.

11. MÜCBİR SEBEP

Doğal afet, salgın, savaş, terör, grev, yangın, genel elektrik ya da internet kesintisi, resmî makam kararları ve tarafların kontrolü dışındaki benzeri olaylar süresince tarafların etkilenen yükümlülükleri askıya alınır. Mücbir sebep 60 günden uzun sürerse taraflardan her biri sözleşmeyi yazılı bildirimle tazminatsız feshedebilir.

12. GİZLİLİK VE KİŞİSEL VERİLER

Tarafların gizlilik yükümlülükleri ve kişisel verilerin işlenmesi, bu sözleşmenin eki olan Kişisel Verilerin Korunması ve Gizlilik Protokolü'nde düzenlenmiştir.

13. SÜRE VE FESİH

13.1. Sözleşme ${start} tarihinde yürürlüğe girer ve ${term}.
13.2. Taraflardan birinin bu sözleşmeye ya da eklerine aykırı davranması ve aykırılığı yazılı ihtardan itibaren 7 gün içinde gidermemesi hâlinde diğer taraf sözleşmeyi yazılı bildirimle derhal feshedebilir. Müzik Lisansı ve Tazmin Taahhütnamesi'ne aykırılık ihtara gerek olmaksızın haklı fesih sebebidir.
13.3. ${COMPANY.brand}, Mekan'ın Platform'u mevzuata aykırı ya da ${COMPANY.brand}'ın itibarını zedeleyecek biçimde kullandığını tespit ederse Mekan'ın Platform erişimini inceleme süresince askıya alabilir.
13.4. Fesih tarihine kadar oluşmuş Hakedişler, varsa mahsuplar yapıldıktan sonra 6. maddeye göre ödenir.
13.5. Sözleşme sona erdiğinde Mekan, ${COMPANY.brand}'a ait QR kodları ve tanıtım materyallerini 7 gün içinde kaldırır ve varsa ${COMPANY.brand}'a ait ekipmanı iade eder.

14. BİLDİRİMLER

Taraflar 1. maddedeki e-posta adreslerine yapılan bildirimlerin geçerli olduğunu kabul eder. Adres değişikliği karşı tarafa bildirilmedikçe eski adrese yapılan bildirim geçerlidir.

15. DEVİR

Mekan, bu sözleşmeden doğan hak ve yükümlülüklerini ${COMPANY.brand}'ın yazılı onayı olmadan üçüncü kişilere devredemez. İşletmenin devri hâlinde Mekan, devri en az 15 gün önceden ${COMPANY.brand}'a bildirir.

16. DEĞİŞİKLİKLER

Bu sözleşme ve ekleri yalnızca taraflarca yazılı olarak ya da ${COMPANY.brand} mekan paneli üzerinden elektronik onayla değiştirilebilir. Değişiklikler onay tarihinden itibaren geçerlidir.${special}

${n[0]}. UYUŞMAZLIK

Bu sözleşmeden doğacak uyuşmazlıklarda Türk hukuku uygulanır; İzmir Mahkemeleri ve İcra Daireleri yetkilidir.

${n[1]}. EKLER VE ONAY

Ek-1 Kişisel Verilerin Korunması ve Gizlilik Protokolü ve Ek-2 Müzik Lisansı ve Tazmin Taahhütnamesi bu sözleşmenin ayrılmaz parçasıdır.

${approval("sözleşmeyi")}`;
}

function kvkkProtocol({ venueName, contract: c }: TemplateInput): string {
  return `Bu protokol, taraflar arasındaki ${COMPANY.brand} Hizmet ve Gelir Paylaşım Sözleşmesi'nin (“Sözleşme”) Ek-1'idir.

1. TARAFLAR

${parties(venueName, c)}

2. AMAÇ

Bu protokol, Sözleşme kapsamında işlenen kişisel verilerin 6698 sayılı Kişisel Verilerin Korunması Kanunu'na (“KVKK”) uygun işlenmesine ve tarafların birbirleriyle paylaştığı ticari bilgilerin gizliliğine ilişkin yükümlülükleri düzenler.

3. MÜŞTERİ VERİLERİ

3.1. Platform'u kullanan Müşterilerin kişisel verilerinin (üyelik bilgileri, kullanıcı adı, jeton ve ödeme kayıtları, şarkı istekleri, cihaz ve bağlantı bilgileri) veri sorumlusu ${COMPANY.brand}'dır. Müşterilerin aydınlatılması ve açık rıza gereken hâllerde rızalarının alınması ${COMPANY.brand}'ın yükümlülüğündedir.
3.2. Mekan, mekan paneli üzerinden yalnızca hizmetin yürütülmesi için gereken sınırlı verilere (Müşteri kullanıcı adı ya da takma adı, istenen şarkılar, istek zamanı, şarkı talebi mesajları) erişir ve bu verileri ${COMPANY.brand} adına, KVKK md. 12/2 kapsamında veri işleyen sıfatıyla işler.
3.3. Mekan bu verileri:
     a) yalnızca şarkı isteklerinin yönetimi ve Mekan'daki müzik yayınının yürütülmesi amacıyla kullanır;
     b) kopyalamaz, dışa aktarmaz, ekran görüntüsü ya da başka yolla kaydetmez, kendi müşteri kayıtlarıyla birleştirmez;
     c) pazarlama, reklam, profil çıkarma ya da iletişim amacıyla kullanmaz;
     d) üçüncü kişilere aktarmaz, açıklamaz ve yurt dışına aktarmaz;
     e) yalnızca görevi gereği erişmesi gereken çalışanlarının erişimine açar ve bu çalışanlara gizlilik yükümlülüğü getirir.
3.4. Mekan, verilerin hukuka aykırı işlenmesini ve verilere hukuka aykırı erişilmesini önlemek için panel hesaplarının güvenliği dahil gerekli teknik ve idari tedbirleri alır (KVKK md. 12/1).
3.5. Mekan, verilerin yetkisiz kişilerce ele geçirildiğini ya da ele geçirildiğinden şüphelendiğini öğrendiği anda ve en geç 24 saat içinde ${COMPANY.email} adresine bildirir ve ${COMPANY.brand}'ın Kişisel Verileri Koruma Kurulu'na ve ilgililere yapacağı bildirimler için gereken bilgi ve desteği sağlar.
3.6. Mekan, bir Müşteriden KVKK md. 11 kapsamında başvuru alırsa başvuruyu yanıtlamadan en geç 3 iş günü içinde ${COMPANY.brand}'a iletir.
3.7. Sözleşme sona erdiğinde Mekan'ın Müşteri verilerine erişimi sona erer; Mekan elinde herhangi bir surette bulunan Müşteri verilerini derhal imha eder.

4. MEKAN YETKİLİ VE ÇALIŞANLARININ VERİLERİ

4.1. ${COMPANY.brand}, Mekan yetkili ve çalışanlarının kimlik ve iletişim bilgilerini (ad-soyad, kullanıcı adı, e-posta, telefon), panel işlem kayıtlarını, IP adresi ve tarayıcı bilgilerini, sözleşme onay kayıtlarını ve ödeme için gereken banka bilgilerini veri sorumlusu sıfatıyla işler.
4.2. Bu veriler; Sözleşme'nin kurulması ve ifası, Hakediş ödemelerinin yapılması, panel güvenliğinin sağlanması, hukuki yükümlülüklerin yerine getirilmesi ve olası uyuşmazlıklarda hakların korunması amaçlarıyla, KVKK md. 5/2 (c), (ç), (e) ve (f) hukuki sebeplerine dayanılarak işlenir.
4.3. Bu veriler; yalnızca yukarıdaki amaçlarla sınırlı olarak ödeme kuruluşları, bankalar, muhasebe ve hukuk danışmanları, yetkili kamu kurumları ile Platform'un barındırma, veritabanı ve e-posta altyapısını sağlayan hizmet sağlayıcılara aktarılabilir. Bu hizmet sağlayıcıların bir kısmının sunucuları yurt dışında bulunabilir; bu aktarımlar KVKK md. 9'a uygun olarak yürütülür.
4.4. Veriler Sözleşme süresince ve Sözleşme'nin sona ermesinden sonra ilgili mevzuatta öngörülen saklama süreleri (vergi mevzuatı için 5 yıl, ticari defter ve belgeler için 10 yıl) boyunca saklanır, ardından silinir, yok edilir ya da anonim hâle getirilir.
4.5. İlgili kişiler KVKK md. 11'deki haklarını ${COMPANY.email} adresine başvurarak kullanabilir.
4.6. Mekan, verilerini ${COMPANY.brand}'a ilettiği ya da panele kullanıcı olarak eklediği çalışanlarını bu madde hakkında bilgilendirmekle yükümlüdür.

5. TİCARİ BİLGİLERİN GİZLİLİĞİ

5.1. Taraflar; Sözleşme koşullarını (komisyon oranı dahil), Hakediş ve kullanım verilerini, Platform'un teknik ve ticari işleyişini ve karşı tarafa ait diğer ticari bilgileri gizli tutar, Sözleşme'nin ifası dışında kullanmaz ve üçüncü kişilere açıklamaz.
5.2. Kamuya açık olan, karşı taraftan bağımsız olarak edinilmiş olan ya da yasal zorunluluk veya yetkili makam kararıyla açıklanması gereken bilgiler gizlilik kapsamı dışındadır. Yasal zorunlulukla açıklama yapacak taraf, mümkünse önceden karşı tarafı bilgilendirir.
5.3. Gizlilik yükümlülüğü Sözleşme'nin sona ermesinden sonra 2 yıl daha devam eder.

6. AYKIRILIK

Mekan'ın bu protokole aykırılığı Sözleşme'nin haklı nedenle feshi sebebidir. Aykırılık nedeniyle ${COMPANY.brand}'a yöneltilen idari para cezaları, tazminat talepleri ve bunlara ilişkin makul giderler Mekan'dan rücu edilir ve Hakedişten mahsup edilebilir.

7. SÜRE

Bu protokol Sözleşme ile birlikte yürürlüğe girer ve Sözleşme süresince geçerlidir; 3.7 ve 5.3. maddeler ile saklama yükümlülükleri Sözleşme'nin sona ermesinden sonra da geçerliliğini korur.

8. ONAY

${approval("protokolü")}`;
}

function musicUndertaking({ venueName, contract: c }: TemplateInput): string {
  return `Bu taahhütname, taraflar arasındaki ${COMPANY.brand} Hizmet ve Gelir Paylaşım Sözleşmesi'nin (“Sözleşme”) Ek-2'sidir.

1. TARAFLAR

${parties(venueName, c)}

2. PLATFORM'UN NİTELİĞİ

2.1. Platform, müzik içeriklerine üçüncü taraf platformlar (YouTube dahil) ve ${COMPANY.brand} kataloğu üzerinden erişerek, Mekan'ın kendi ses sisteminde çalınacak şarkıların Müşterilerce istenmesini ve sıralanmasını sağlayan bir araçtır.
2.2. ${COMPANY.brand}, 5846 sayılı Fikir ve Sanat Eserleri Kanunu (“FSEK”) kapsamındaki eserlerin ve bağlantılı hak konularının Mekan'da umuma iletimi, temsili ya da çoğaltılması için Mekan'a herhangi bir lisans vermez, satmaz ya da devretmez. Jeton bedeli bir müzik lisansı bedeli değildir.

3. MEKAN'IN BEYAN VE TAAHHÜTLERİ

Mekan;
3.1. İşletmesinde umuma açık müzik kullanımı için gereken meslek birliği izinlerini (başta MESAM, MSG, MÜYORBİR ve MÜ-YAP olmak üzere ilgili tüm meslek birlikleri) almış olduğunu ya da Platform'u kullanmaya başlamadan önce alacağını,
3.2. Bu izinleri Sözleşme süresince geçerli tutacağını; izinlerden herhangi birinin sona ermesi, askıya alınması ya da iptali hâlinde durumu derhal ${COMPANY.brand}'a bildireceğini ve izin yeniden alınana kadar Platform'u kullanmayacağını,
3.3. ${COMPANY.brand}'ın talebi üzerine izin belgelerinin suretlerini 7 gün içinde ibraz edeceğini,
3.4. Platform üzerinden erişilen içerikleri indirmeyeceğini, kaydetmeyeceğini, çoğaltmayacağını ve Platform dışında kullanmayacağını; üçüncü taraf platformların kullanım koşullarını ihlal edecek teknik müdahalelerde bulunmayacağını,
3.5. İşletmesinde çalınan içerikten, ses seviyesinden ve çalma saatlerinin gürültü, çevre ve belediye mevzuatına uygunluğundan sorumlu olduğunu; genel ahlaka, kamu düzenine ya da mekanın niteliğine uygun olmayan istekleri panel üzerinden engelleyeceğini
kabul, beyan ve taahhüt eder.

4. ÜÇÜNCÜ TARAF İÇERİKLER

Mekan, Platform'da erişilen içeriklerin üçüncü taraf platformların kullanım koşullarına tabi olduğunu; içeriklerin hak sahipleri ya da ilgili platformlar tarafından kaldırılabileceğini, erişime kapatılabileceğini ya da bölgesel kısıtlamaya tabi olabileceğini ve bu durumun ${COMPANY.brand}'ın kusuru sayılmayacağını kabul eder.

5. TAZMİN

5.1. Mekan'ın 3. maddedeki izinlere sahip olmaması ya da bu taahhütnameye aykırı davranması nedeniyle ${COMPANY.brand}'a karşı ileri sürülen her türlü talep, dava, idari para cezası, tazminat, yargılama gideri ve makul avukatlık ücreti Mekan tarafından karşılanır.
5.2. ${COMPANY.brand} böyle bir talebi öğrendiğinde Mekan'a makul süre içinde bildirir ve Mekan'ın savunmaya katılmasına imkân tanır.
5.3. ${COMPANY.brand} bu kapsamda bir ödeme yapmak zorunda kalırsa ödediği tutarı ödeme tarihinden itibaren işleyecek yasal faiziyle birlikte Mekan'dan rücu eder ve Hakedişten mahsup edebilir.

6. ASKIYA ALMA VE FESİH

Mekan'ın 3. maddedeki izinlere sahip olmadığının anlaşılması ya da bu taahhütnameye aykırı davranması hâlinde ${COMPANY.brand}, Mekan'ın Platform erişimini derhal askıya alabilir ve Sözleşme'yi ihtara gerek olmaksızın haklı nedenle feshedebilir.

7. SÜRE

Bu taahhütname Sözleşme ile birlikte yürürlüğe girer ve Sözleşme süresince geçerlidir. 5. madde, Sözleşme süresince gerçekleşen olaylar bakımından Sözleşme'nin sona ermesinden sonra da geçerliliğini korur.

8. ONAY

${approval("taahhütnameyi")}`;
}

const BUILDERS: Record<DocumentKind, (input: TemplateInput) => string> = {
  service: serviceContract,
  kvkk: kvkkProtocol,
  music: musicUndertaking,
};

export function contractDocument(kind: DocumentKind, input: TemplateInput): { kind: DocumentKind; title: string; body: string } {
  const def = DOCUMENT_KINDS.find((d) => d.kind === kind)!;
  return { kind, title: `${input.venueName} — ${suffix(def.title)}`, body: BUILDERS[kind](input) };
}

export function contractDocuments(input: TemplateInput) {
  return DOCUMENT_KINDS.map((d) => contractDocument(d.kind, input));
}
