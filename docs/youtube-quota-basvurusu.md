# YouTube Data API Kota Artışı Başvuru Paketi

Form: **YouTube API Services – Audit and Quota Extension Form**
https://support.google.com/youtube/contact/yt_api_form?hl=en

Süreç: Varsayılan 10.000 birim/gün üzerine çıkmak için önce uyumluluk denetimi
(audit) zorunlu. Form gönderildikten sonra YouTube API ekibi e-posta ile döner;
süre birkaç hafta ile birkaç ay arası. Ek soru gelirse aynı e-posta zincirinden
yanıtlanır.

---

## 1) Göndermeden önce yapılacaklar (checklist)

- [ ] **Migration 0013**: `supabase/migrations/0013_metadata_refresh.sql` dosyasını
      Supabase Dashboard > SQL Editor'da çalıştır (songs.metadata_refreshed_at kolonu —
      30 gün veri tazeleme cron'u buna bağlı).
- [ ] **Prod deploy**: footer, YouTube atfı ve cron içeren sürüm yayında olmalı
      (cron `vercel.json` ile deploy'da otomatik kaydolur; `CRON_SECRET` üç ortama eklendi).
- [ ] **GCP proje numarası**: https://console.cloud.google.com → YOUTUBE_API_KEY'in
      alındığı proje → Dashboard'da "Project number" (sadece rakam; Project ID değil).
- [ ] **Demo hesap**: Denetçi için bir misafir hesabı oluştur
      (örn. kullanıcı `google-review`, basit bir şifre) ve bir demo mekan URL'i belirle.
      Denetçi arama yapıp şarkı isteyebilmeli.
- [ ] **Ekran görüntüleri** (JPEG/PNG/PDF):
  - [ ] Mekan sayfası (footer'daki "Gizlilik Politikası" linki görünür şekilde)
  - [ ] `/privacy` sayfası — "YouTube API Services" bölümü, Google Privacy Policy
        linki ve "Data Retention" (30 gün) bölümü görünür şekilde
  - [ ] `/terms` sayfası — "YouTube Requirements" bölümü görünür şekilde
  - [ ] Arama ekranı — "YouTube Sonuçları" başlığı ve alttaki
        "Arama sonuçları ve müzik verileri YouTube tarafından sağlanır" atfı görünür şekilde
  - [ ] Admin player sayfası — gömülü YouTube player'ın üstü kapatılmadan,
        video görünür şekilde çalarken
- [ ] Formu doldurup gönder (aşağıdaki hazır cevaplarla).

İsteğe bağlı ama başvuruyu güçlendirir: özel alan adı (vercel.app yerine) ve
alan adıyla eşleşen bir iletişim e-postası.

---

## 2) Forma yapıştırılacak hazır cevaplar (İngilizce)

### Section 1 — Request Type
> **Compliance audit for quota extension**

### Section 2 — Organization & Contact
- Application type: **Individual** (şirket kurulduysa Organization seç ve bilgileri güncelle)
- Full legal name: **Taner Yıldırım**
- Primary website: **https://pmj-seven.vercel.app**
- Country: **Türkiye** (adres bilgilerini doldur)
- Business category: **Entertainment / Music**
- Primary contact: **Taner Yıldırım — taneryldrm111@gmail.com** (technical & business aynı)

### Section 3 — Business Model
**Organization's work description** (100+ karakter):

> PlayMyJam is a social music request platform for hospitality venues (cafes,
> bars, restaurants) in Türkiye. Guests at a venue open the venue's PlayMyJam
> page on their own phone, search for songs, and request them. The venue plays
> the requested music on a single venue-operated device through the official
> YouTube embedded (IFrame) player, with the video always visible and never
> covered or modified. YouTube Data API is used only to let guests search for
> music and to keep stored video metadata fresh. The platform does not download,
> cache, or re-stream any audio/video content; all playback happens exclusively
> inside the official YouTube player.

- Target audience: **Businesses (hospitality venues) and their guests / general public**
- Monetization model: dürüst cevap ver — jeton sistemi şu an ücretsizse:
  > Currently free. Planned model: venues pay a SaaS subscription for the queue
  > management software. We do not sell advertising on or around YouTube content,
  > and we do not monetize YouTube content itself.
- Advertising on YouTube content: **No**
- Google representative: **No / None**
- Content Owner ID / Google Ads ID: boş bırak

### Section 4 — API Client
- API Client name: **PlayMyJam**
- Contains "YouTube" in name: **No**
- Primary access URL: **https://pmj-seven.vercel.app**
- Privacy policy URL: **https://pmj-seven.vercel.app/privacy**
- Terms of service URL: **https://pmj-seven.vercel.app/terms**
- Publicly accessible: **Yes**
- Demo account: oluşturduğun misafir hesabının bilgilerini gir; login URL olarak
  demo mekan sayfasını ver ve şu notu ekle:
  > Open the venue URL, sign in with the demo guest account, tap the search tab,
  > search for any song, and request it. The venue's playback screen (admin
  > player) shows the embedded YouTube player. Admin demo credentials can be
  > provided on request.

### Section 5 — Use Case & Quota
- Number of projects: **1**
- Google Cloud project number: **[GCP Console'dan alınan rakam]**
- Use case: **Websites & mobile apps** (istersen ek olarak "Smart TVs, consoles & hardware" işaretleme — kullanmıyoruz)
- Requires users to sign in (OAuth): **No** — sadece API key ile herkese açık veri
  (search.list, videos.list, playlistItems.list); kullanıcı adına hiçbir YouTube
  hesabı işlemi yapılmıyor.
- Derived metrics / 36-month storage: **işaretleme** (gerek yok)
- Current API usage volume: **Fewer than 1,000 requests/day**
- Endpoints: **youtube.search.list, youtube.videos.list, youtube.playlistItems.list**

**Total quota request:** Above default quota
- Total per-day quota: **100,000 units/day**
- Peak per-minute quota: **2,000 units/minute**
- youtube.search.list için ayrı kota sorulursa: **90,000 units/day**

**Detailed justification** (yapıştır):

> PlayMyJam lets venue guests search YouTube for music to request at the venue.
> Each uncached guest search costs 101 units (search.list = 100 + one videos.list
> batch = 1). We aggressively minimize API usage with three layers: (1) a local
> catalog of previously requested songs is searched first at zero quota cost,
> (2) identical queries are served from a 30-day server-side search cache without
> calling the API, and (3) only cache misses reach search.list. We also comply
> with the 30-day data policy via a daily job that refreshes stored video
> metadata with videos.list (1 unit per 50 videos) and deletes expired cached
> search results.
>
> Despite this, the default 10,000 units/day allows only ~99 uncached searches
> per day across all venues combined. A single busy venue evening generates
> 100–300 unique guest searches; with our current venues and onboarding pipeline
> we exhaust the daily quota during peak evening hours, after which guests lose
> search functionality (the app degrades gracefully to the local catalog, but new
> songs cannot be discovered).
>
> 100,000 units/day (~990 uncached searches/day) supports roughly 20–30 active
> venues with headroom for evening peaks. Peak load is concentrated between
> 19:00–01:00 local time (UTC+3); 2,000 units/minute (~19 concurrent uncached
> searches) covers simultaneous peaks across venues. videos.list and
> playlistItems.list usage is negligible (single-digit units per call, used for
> song detail pages, playlist imports by venue admins, and the daily metadata
> refresh job).

---

## 3) Uyumluluk durumu (denetçi sorarsa dayanaklar)

| Şart | Durumumuz |
|---|---|
| Privacy policy'de YouTube API Services + Google Privacy Policy linki | `/privacy` §4 |
| Kullanıcıya YouTube ToS'a bağlı olduğunun bildirilmesi | `/privacy` §4 ve `/terms` §3 |
| Privacy/ToS linklerinin uygulamadan erişilebilirliği | Tüm mekan sayfalarında footer |
| YouTube atfı (branding) | Arama sonuçları altında "veriler YouTube tarafından sağlanır" |
| 30 gün veri saklama (Policy III.E.4) | Günlük cron: search_cache >30g silinir, songs metadata videos.list ile tazelenir; video ID'ler muaf |
| Player değiştirilemez / üstü kapatılamaz | Player üzerinde overlay yok; şarkı bilgisi videonun dışında gösterilir |
| Ses/video indirme, ayrıştırma yok | Yalnızca resmi IFrame player; içerik saklanmıyor (`/terms` §5) |
| Kendi adında "YouTube" kullanmama | Uygulama adı "PlayMyJam" |
| Kota verimliliği | 3 katman: yerel katalog → 30g arama önbelleği → search.list |

## 4) Gönderim sonrası

- Yanıt genelde başvurudaki e-postaya gelir; ek soru/ekran kaydı isteyebilirler.
- Red gelirse: eksik belirtilen maddeler düzeltilip **Appeals Form** ile itiraz edilir.
- Onay sonrası kota, GCP Console > APIs & Services > YouTube Data API v3 > Quotas
  ekranından takip edilir. YouTube periyodik denetim isteyebilir — cron ve footer
  kalıcı kalmalı.
