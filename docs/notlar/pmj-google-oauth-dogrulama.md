---
name: pmj-google-oauth-dogrulama
description: youtube.readonly OAuth doğrulaması + onay ekranında marka adı/logo — Supabase Pro alınana kadar BEKLEMEDE (23 Eyl 2026 kullanıcı kararı)
metadata: 
  node_type: memory
  type: project
  originSessionId: f996b328-f17a-4662-9f50-39b7ba49469b
  modified: 2026-09-23T00:00:00.000Z
---

`youtube.readonly` kapsamı 12 Ağustos 2026'da Data Access'e eklendi ve [[pmj-youtube-hesap-secici]] canlıda çalışıyor, ama **OAuth doğrulaması henüz gönderilmedi**. Bu yüzden kullanıcılar "Google bu uygulamayı doğrulamadı" uyarı ekranını geçiyor ve proje ömrü boyunca **100 kullanıcı tavanı** işliyor (sıfırlanamaz).

**21 Eyl 2026 — BEKLEMEDE (kullanıcı "şimdilik bekle" dedi).** Supabase yeni projeye taşınınca (bkz. [[pmj-supabase-hesabi]]) özel alan adı kayboldu; Google girişi `quvkscvbsplxkuolvhwe.supabase.co` üzerinden gidiyor ve bu alan Search Console'da doğrulanamadığı için branding kontrolü düşer. Sunulan iki yol: (a) Supabase Pro (~25$) + custom domain eklentisi (~10$/ay) ile auth.playmyjam.com.tr'yi yeni projeye bağlamak — yayılım planı da zaten Pro istiyor ([[pmj-yayilim-plani-2026-09]]), o yükseltmede bunu da yap; (b) youtube.readonly'yi kaldırmak (temel kapsamlar doğrulama istemez, "YouTube hesabımdan seç" gider). `auth.playmyjam.com.tr` CNAME'i hâlâ eski projeye bakıyor — DNS TurkTicaret'te, kullanıcı silmeli ya da (a)'da yeni projeye çevirmeli. Aşağıdaki 2. adım ancak (a)'dan sonra geçerli.

**23 Eyl 2026 — kullanıcı onay ekranında `quvkscvbsplxkuolvhwe.supabase.co` yerine "PlayMyJam" + logo istedi; kararı: Supabase Pro'ya geçince yapılacak.** O gün yapılacak sıra:
1. Supabase Pro (~25$) + Custom Domain eklentisi (~10$/ay) → `auth.playmyjam.com.tr`.
2. TurkTicaret DNS: `auth` CNAME'i eski `rtvnbhifqxdeljijxtpe` yerine `quvkscvbsplxkuolvhwe.supabase.co`'ya çevir + `_acme-challenge.auth` TXT'yi yenile.
3. Google OAuth client redirect URI → `https://auth.playmyjam.com.tr/auth/v1/callback`; Vercel'de 3 ortamda `NEXT_PUBLIC_SUPABASE_URL` aynı adres (kodda değişiklik yok).
4. Branding: app name "PlayMyJam", logo `public/logo-mark.png` (120x120), authorized domain `playmyjam.com.tr`. **İsim custom domain sonrası hemen görünür; logo ancak marka doğrulaması onaylanınca görünür** — yani logo istiyorsak aşağıdaki doğrulama başvurusu da gönderilmeli.

Uyarıyı kaldırmak için kalan sıra (engel kalkınca):

1. **Branding doğrulaması geçmeli** — kapsam incelemesi bu bitmeden başlamıyor. 12 Ağu'da "app name does not match" + "home page does not explain purpose" maddeleri otomatik kontrolde 4 kez düştü; sahiplik maddesi Search Console meta etiketiyle (layout.tsx `metadata.verification.google`) çözüldü. Kalan iki madde için ana sayfa h1'ine "PlayMyJam ile mekanda müziği sen seç", hero rozetine ve footer'a marka adı eklendi, onay ekranının home page alanı `playmyjam.com.tr/hakkimizda` yapıldı (o sayfada "Google Hesabı Verilerinin Kullanımı" bölümü var). Yine geçmezse "I believe the issues found are incorrect" ile insan incelemesine gönderilecek.
2. **Authorized domains'ten `rtvnbhifqxdeljijxtpe.supabase.co` silinmeli** — Google her authorized domain'in Search Console'da bize ait olmasını istiyor, o domain bizim değil. OAuth artık `auth.playmyjam.com.tr` üzerinden gittiği için gereksiz; silmeden önce OAuth client'ın redirect URI listesinde ham supabase adresi olmadığı doğrulanmalı.
3. ~~`/privacy` sayfasına `youtube.readonly` + Limited Use paragrafı~~ **YAPILDI (6 Eyl 2026)** — iki dilli "5. Google Hesabı Verileri ve Sınırlı Kullanım" bölümü eklendi (kapsamın tam adı, jetonun DB'ye yazılmadığı, myaccount.google.com/permissions ile iptal, Limited Use taahhüdü); eski 5-8 bölümleri 6-9'a kaydı.
4. **Kapsam gerekçesi** — İngilizce metin artık `docs/google-oauth-dogrulama.md` içinde hazır (demo videosu senaryosu ve branding alan değerleriyle birlikte); Verification Center'a yazılacak (İngilizce metin hazır: yalnız okuma, playlists.list?mine=true ile mekanın kendi listelerini kopyalama, hiçbir yazma işlemi yok, daha dar kapsam mevcut değil).
5. **Demo videosu** — unlisted YouTube; adres çubuğunda playmyjam.com.tr, Google onay ekranı okunacak kadar net ve yavaş, ardından liste seçip aktarma. Kullanıcının işi.
6. **Submit** → sensitive kapsamda tipik 2-6 hafta, yazışma `info@playmyjam.com.tr`'ye gelir; cevapsız kalan e-posta başvuruyu düşürür.

Not: Bu, YouTube'un kota artışı için istediği compliance audit'ten ayrı bir dosya (bkz. [[pmj-youtube-quota-2026-07]]).
