# Play My Jam — Yol Haritası

_Son güncelleme: 17 Temmuz 2026_

## Mevcut Durum (Faz 0 — tamamlananlar)

- ✅ Ürün canlıda: `playmyjam.com.tr` alındı, prod alias `pmj-seven.vercel.app`
- ✅ YouTube geçişi tamamlandı (Spotify kaldırıldı, IFrame player + yerel-önce arama)
- ✅ Jeton sistemi rework'ü + global cüzdan + işlem geçmişi
- ✅ Push bildirimleri + admin istatistik paneli
- ✅ Müşteri auth rework'ü (180 gün kayan oturum, mekan listesinden giriş)
- ✅ Yeni marka kimliği (logo, favicon, PWA ikonları, OG görseli)
- ✅ İzmir mekan listesi hazır: `izmir_mekan_listesi.xlsx` — ~113 mekan, arama/görüşme/sonuç takip kolonlarıyla
- 🔄 Tosla İşim başvurusu: şartlar sitede yayında, TRABİS yayılımı + form bekliyor
- 🔄 YouTube kota artışı: başvuru cevapları hazır (`docs/youtube-quota-basvurusu.md`), form gönderimi bekliyor

---

## Faz 1 — Ödeme Entegrasyonu (EN KRİTİK, her şey buna bağlı)

Gelir ancak ödeme alınabildiğinde başlar. Pazarlamaya para/zaman harcamadan önce bu faz bitmeli.

- [ ] Tosla İşim başvurusunu sonuçlandır (TRABİS yayılımı sonrası formu gönder)
- [ ] Paralel olarak Param ve banka sanal POS görüşmelerini yürüt (tek sağlayıcıya bağımlı kalma)
- [ ] Sağlayıcı seçimi: komisyon oranı, para transfer süresi (T+1/T+2), API kalitesi, 3D Secure zorunluluğu karşılaştır
- [ ] Teknik entegrasyon:
  - [ ] Ödeme başlatma + callback/webhook akışı (jeton satın alma → cüzdana yükleme)
  - [ ] Başarısız/yarım kalan ödeme senaryoları (idempotency, çifte yükleme koruması)
  - [ ] Test ortamında uçtan uca senaryo testleri
  - [ ] Prod'da düşük tutarlı gerçek ödeme testi
- [ ] Yasal/operasyonel hazırlık:
  - [ ] Mesafeli satış sözleşmesi + ön bilgilendirme formu (sitede yayında, sağlayıcı şartlarına göre revize)
  - [ ] İade/iptal politikası (kullanılmamış jeton iadesi kuralı)
  - [ ] Fatura/e-arşiv süreci (jeton satışı faturalandırması, mali müşavirle netleştir)
- [ ] Fiyatlandırma son kontrol: jeton paketleri + mekan komisyon/abonelik modeli kesinleşsin

**Çıkış kriteri:** Gerçek bir müşteri karta basıp jeton alabiliyor, para hesaba düşüyor, fatura kesilebiliyor.

---

## Faz 2 — Pilot Mekanlar (3–5 mekan, İzmir)

Toplu satışa çıkmadan önce ürünü gerçek sahada kanıtla.

- [ ] `izmir_mekan_listesi.xlsx` içinden 3–5 pilot aday seç (ideal: MyVia414 gibi kümelenmiş, genç kitleli, canlı müzik/DJ olan yerler — tek ziyaretle çok mekan)
- [ ] Pilot teklifi hazırla: ilk 1–2 ay komisyonsuz/ücretsiz kullanım karşılığında geri bildirim + referans hakkı
- [ ] Onboarding kiti:
  - [ ] Masa QR tasarımları (baskıya hazır, mekan logolu varyant)
  - [ ] Mekan paneli için 1 sayfalık hızlı başlangıç kılavuzu
  - [ ] DJ/personel için 5 dakikalık eğitim akışı
- [ ] Her pilotta ilk hafta yerinde takip: gerçek kullanım, takılan noktalar, personelin tepkisi
- [ ] Haftalık geri bildirim döngüsü → hızlı ürün düzeltmeleri
- [ ] Pilot metriklerini topla: masa başına istek sayısı, jeton harcaması, tekrar kullanım oranı

**Çıkış kriteri:** En az 2 mekan "bunu kullanmaya devam ederim" diyor + referans olmayı kabul ediyor.

---

## Faz 3 — Saha Satışı (mekan listesini işle)

- [ ] Satış sunumu/broşürü hazırla (1 sayfa: mekana ne kazandırır — müşteri etkileşimi, ek gelir, veri)
- [ ] Pilot mekanlardan vaka rakamları ekle ("X mekanında ilk ay Y istek")
- [ ] 113 mekanlık listeyi bölge bölge işle (xlsx'teki Arandı/Görüşüldü/Sonuç kolonlarını CRM gibi kullan)
- [ ] Haftalık hedef koy: örn. 15 arama, 5 yüz yüze görüşme, 2 kayıt
- [ ] Standart demo akışı: telefonda 10 dakikada canlı gösterim (QR okut → şarkı iste → panelde gör)
- [ ] İtiraz cevap listesi hazırla ("DJ'imiz zaten istek alıyor", "komisyon yüksek", "müşteri kullanmaz" vb.)
- [ ] Liste büyütme: İzmir tamamlanırken Manisa/Aydın/Çeşme sezonluk mekanları ekle

**Çıkış kriteri:** Aylık düzenli yeni mekan kaydı akışı (örn. ayda 4+ aktif mekan).

---

## Faz 4 — Instagram & İçerik Yönetimi

Saha satışıyla paralel yürür; mekanlara "sizi tanıtırız" kozu da verir.

- [ ] @playmyjam hesabını kur/düzenle: bio, link, marka görselleriyle tutarlı grid
- [ ] İçerik takvimi (haftada 3–4 içerik):
  - Reels: mekanda QR okutup şarkı çaldırma anları (en güçlü format)
  - Mekan tanıtım işbirlikleri (ortak paylaşım — mekanın da işine gelir)
  - "Bu hafta en çok istenen şarkılar" tarzı veri içerikleri (admin istatistiklerinden beslenir)
  - Kullanıcı hikayeleri / repost'lar (UGC)
- [ ] Canva şablon seti: story, post, reels kapak şablonları (marka renkleriyle bir kez hazırla, sürekli kullan)
- [ ] Anlaşılan her mekan için "PMJ burada" duyuru paylaşımı + mekanın story'sinde paylaşması için hazır görsel
- [ ] Instagram → site dönüşümü ölçmek için link takibi (utm)

**Çıkış kriteri:** Düzenli paylaşım ritmi oturmuş, mekan işbirliği paylaşımları akışa girmiş.

---

## Faz 5 — Influencer Marketing & Akım Yaratma

Ancak Faz 2–3'te sağlam mekan ağı varken anlamlı — influencer'ın gönderdiği kitle gidecek mekan bulabilmeli.

- [ ] İzmir gece hayatı/eğlence odaklı mikro influencer listesi çıkar (10K–100K, etkileşimi yüksek)
- [ ] Kampanya konsepti: "şarkını sen seç" / "mekanın müziğini sen yönet" — video başına doğal kullanım anı
- [ ] Takas modeli önce: ücretsiz jeton + mekanda ağırlama karşılığı içerik (nakit bütçeden önce)
- [ ] Her influencer'a özel jeton hediye kodu/kampanyası → hangi influencer dönüşüm getiriyor ölç
- [ ] İşe yarayan formatı bulunca 2–3 influencer ile tekrarlı anlaşma (tek seferlik değil seri içerik)
- [ ] Viral an avcılığı: mekanlarda çekilen gerçek "şarkım çaldı" tepki videolarını toplayıp kullan

**Çıkış kriteri:** En az bir kampanyada ölçülebilir kayıt/jeton satışı artışı.

---

## Faz 6 — Ölçekleme

- [ ] YouTube API kota artışı sonuçlansın (büyüyen kullanımda şart — form gönderimi Faz 1 ile paralel yapılabilir)
- [ ] İzmir dışına açılım: sezona göre Çeşme/Alaçatı (yaz), sonra İstanbul/Ankara
- [ ] Mekan self-servis onboarding: satış görüşmesi olmadan kayıt olup başlayabilme
- [ ] Destek süreci: mekan ve müşteri için WhatsApp hattı / SSS sayfası
- [ ] Altyapı gözden geçirme: artan trafikte Supabase/Vercel maliyet ve limit kontrolü
- [ ] Fiyatlandırmayı gerçek veriyle revize et (hangi paket satıyor, mekan başına gelir)

---

## Sürekli İşler (faz bağımsız)

- Haftalık: admin istatistiklerinden kullanım raporu (aktif mekan, istek sayısı, jeton satışı)
- Mekan listesi (xlsx) güncel tutulur — her temas kaydedilir
- Ürün bakımı: hata düzeltmeleri, mekanlardan gelen küçük istekler
- Instagram paylaşım ritmi hiç düşmez (akım yaratmanın ön koşulu süreklilik)

## Takip Edilecek Ana Metrikler

| Metrik | Neden |
|---|---|
| Aktif mekan sayısı | Ağın büyüklüğü — her şeyin temeli |
| Mekan başına haftalık şarkı isteği | Ürün gerçekten kullanılıyor mu |
| Jeton satış cirosu | Gelir |
| Müşteri tekrar kullanım oranı | Akım mı, tek seferlik merak mı |
| Satış hunisi (arandı → görüşüldü → kayıt) | Saha satışının verimi |

## Öncelik Sırası (özet)

1. **Şimdi:** Ödeme entegrasyonu (Tosla/Param) — tek blokaj bu
2. **Ödeme biter bitmez:** 3–5 pilot mekan + onboarding kiti
3. **Pilotla paralel:** Instagram'ı kur, içerik ritmini başlat
4. **Pilot kanıtlanınca:** 113'lük listeyi sistemli işle (saha satışı)
5. **Mekan ağı oturunca:** Influencer kampanyaları ile akım yarat
6. **Sonra:** Yeni şehirler ve self-servis ölçekleme
