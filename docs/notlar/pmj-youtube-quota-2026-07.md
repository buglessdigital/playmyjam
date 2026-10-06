---
name: pmj-youtube-quota-2026-07
description: "YouTube kota artışı — form 23 Tem 2026'da GÖNDERİLDİ (Organization/Bugless Digital); YouTube ekibinin yanıtı bekleniyor"
metadata: 
  node_type: memory
  type: project
  originSessionId: cab7a34c-b7e5-4fdc-b21c-b68904d80066
  modified: 2026-07-25T19:23:17.311Z
---

YouTube Data API kota artışı hazırlığı (13 Temmuz 2026), bkz. [[pmj-youtube-migration-2026-07]].

- Uyumluluk kodu tamam ve prod'da (commit ba314b0): LegalFooter (tüm venue sayfaları), arama sonuçlarında YouTube atfı, `/api/cron/youtube-refresh` (günlük 03:00 UTC — search_cache >30g siler, songs metadata'sını videos.list ile tazeler, kayıp videoları embeddable=false yapar). CRON_SECRET üç Vercel ortamına eklendi.
- Başvuru dokümanı: `docs/youtube-quota-basvurusu.md` — formun tüm cevapları hazır (100k birim/gün, 2k/dk talebi).
- GCP proje numarası: 152026561871 (proje "Play My Jam", ID play-my-jam-502210) — dokümana işlendi.
- Migration 0013 uygulandı (13 Tem); cron prod'da elle tetiklenip doğrulandı: 242 bayat şarkının tamamı tazelendi (ilk turda 1 satır geçici hatayla kaldı, ikinci turda tamamlandı).
- **Karar (13 Tem):** Başvuru bekletiliyor — limited şirket ~10 gün içinde (Temmuz sonu 2026) kurulacak, başvuru şirket adına ("Organization") yapılacak. Sıra: özel domain al → Vercel'e bağla + tüm URL'leri güncelle → şirket bilgileriyle doküman Section 2'yi güncelle → ekran görüntüleri (yeni domain görünür olmalı) → demo hesap → form gönderimi.
- Kota GCP projesine bağlı olduğundan bireysel→kurumsal geçiş teknik sorun değil; ama inceleme ortasında tüzel kişilik değişikliği riskine karşı baştan şirketle başvurma tercih edildi.

**GÜNCELLEME (23 Tem 2026) — FORM GÖNDERİLDİ:** "Your email has been sent — Thank you for submitting the YouTube API Services Form" onayı alındı.
- Başvuru: **Organization → "Bugless Digital"** (yasal ad), adres Bornova/İzmir 35040, kategori Media and Entertainment, size Startup.
- Primary contact: **taneryldrm112@gmail.com** (GCP proje 152026561871'in sahibi Google hesabı — teyit edildi). Business contact: taneryildirim@buglessdigital.com.tr.
- URL'ler özel domaine güncellendi: primary **https://playmyjam.com.tr**, /privacy, /terms.
- Kota talebi: search.list **90.000/gün + 2.000/dk**, diğer endpoint'ler (videos.list+playlistItems.list) **10.000/gün + 200/dk** = toplam ~100k/gün. Use case: Websites & Mobile Apps. OAuth: No.
- Bu oturumda yapılan kod işi (commit b04e6dc deploy'da): 6 yasal/kurumsal sayfa iki dilli (TR/EN toggle, `components/ui/BilingualLegal.tsx`); `app/layout.tsx` metadataBase → playmyjam.com.tr.
- Yüklenen kanıtlar: Privacy PDF, Terms PDF, ana sayfa footer görseli, player+arama (PMJ-form.pdf), mimari diyagram + user-flow diyagramı (scratchpad'de HTML), YouTube atıf görseli.
- **Not:** İlk submit denemesi ~4 dk client-side hung oldu (Network'e POST gitmedi), sayfa yenilenince form sıfırlandı; ikinci denemede başarılı. Aktif mekan HENÜZ YOK — denetim compliance odaklı, demo mekan "ecem-s-house" üzerinden gösterildi.

**GÜNCELLEME 2 — YouTube ek bilgi istedi, gönderildi:** İlk gönderimden sonra YouTube ekibi "sufficient information yok, API kullanımını gösteren İngilizce adım adım screencast (video) gönderin" dedi (7 iş günü verildi). Kullanıcı videoyu çekti (misafir arama → YouTube Sonuçları + atıf → önbellek katmanları → jetonla istek → admin player'da gömülü IFrame oynatma → /privacy + /terms İngilizce) ve aynı e-posta zincirine yanıtladı. Şimdi YouTube ekibinin nihai değerlendirmesi bekleniyor.

**GÜNCELLEME 3 — KRİTİK proje uyuşmazlığı bulundu ve düzeltildi (25 Tem 2026):** Kotayı GCP Console'dan takip ederken fark edildi: **başvuru yaptığımız proje "Play My Jam" (152026561871) YouTube Data API'yi hiç kullanmıyordu** (API etkin değildi, 0 trafik). Uygulamanın `YOUTUBE_API_KEY`'i aslında **başka bir projeye ("My First Project", aynı org taneryks2022-org) aitmiş** — orada YouTube Data API etkin ve gerçek trafik vardı (33 istek). Bu, YouTube'un "sufficient information yok" demesinin muhtemel sebebi (denetçi 152026561871'de kullanım göremedi).
- **Düzeltme:** 152026561871'de YouTube Data API v3 etkinleştirildi → yeni API key oluşturuldu (API restriction: sadece YouTube Data API v3; application restriction: None çünkü sunucu tarafı/Vercel dinamik IP) → Vercel `YOUTUBE_API_KEY` Production+Preview'da bu yeni anahtarla değiştirildi → prod redeploy edildi. Canlı `/api/search` testi geçti (source:youtube, gerçek sonuçlar). Artık trafik doğru projede (152026561871) görünecek.
- **Yapılacak:** Kullanıcı YouTube e-posta zincirine "kullanım artık başvuru projesi 152026561871'de görünür" notu düşecek. Eski "My First Project" anahtarı artık kullanılmıyor.

**Why:** Denetim (audit) sonucu gelene kadar süreç haftalar–aylar sürebilir; ek soru gelirse doküman dayanak tablosu içeriyor.
**How to apply:** Yanıt taneryldrm112@gmail.com'a gelir. Bu süreçte cron ve footer'daki YouTube atfı/linkler KALICI kalmalı (denetçi tekrar bakabilir). Red gelirse Appeals Form ile itiraz. Onay sonrası kota GCP Console > YouTube Data API v3 > Quotas'tan takip.
