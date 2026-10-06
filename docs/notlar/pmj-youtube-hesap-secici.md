---
name: pmj-youtube-hesap-secici
description: "YouTube hesabından tıkla-seç playlist aktarma — canlıda; jeton çerezde, gizli listeler senkronsuz"
metadata: 
  node_type: memory
  type: project
  originSessionId: f996b328-f17a-4662-9f50-39b7ba49469b
  modified: 2026-08-12T11:47:47.956Z
---

12 Ağustos 2026'da canlıya çıktı: mekan, içe aktarma kutusundaki "YouTube hesabımdaki listelerden seç" ile Google'a bağlanıp kendi listelerini tıkla-seç aktarabiliyor. Bağlantı yapıştırma yolu duruyor ve artık çok satırlı (her bağlantı ayrı kutu, "Bağlantı Ekle").

Mimari kararlar ve nedenleri:

- **Erişim jetonu veritabanına yazılmıyor.** `provider_token` httpOnly çerezde (`pmj_yt_token`, ~55 dk, `lib/youtube-token.ts`). Akış "listele → seç → aktar" ile dakikalar içinde bittiği için refresh token yönetimi, şifreleme ve iptal akışı kurmaya değmedi.
- **Gizli (private) listeler `auto_sync=false` ile aktarılıyor.** Günlük cron API anahtarıyla koşuyor ve gizli listeyi göremez; açık bırakılsa her gün 404 yiyip `fail_count` şişerdi. Kalıcı senkron ancak refresh token saklanırsa mümkün.
- **`lib/youtube.ts`'teki çağrılar opsiyonel `accessToken` alıyor** — verilirse istek mekanın hesabı adına gider (gizli listeler ancak böyle okunur), kota yine bizim projemizden düşer.
- Aktarım hep **sıralı**: paralel gitmek YouTube kotasını ve 429'ları tetikliyor. Her satırın altında kendi durumu (aktarılıyor / eklenen şarkı / HTTP kodu + hata) yazıyor.
- Google'dan dönüşte `/admin/{slug}?youtube=connected|youtube_error=...` ile panel açılıyor ve modal kendiliğinden seçici modunda geliyor.

Şart olan dış ayar: Supabase → Authentication → URL Configuration → Redirect URLs listesinde `https://playmyjam.com.tr/api/admin/youtube/callback` bulunmalı.

"Beğenilen Müzik" ve algoritmik karışımlar (Discover Mix vb.) YouTube API'sinde hiç dönmüyor, seçicide görünmezler.

Doğrulama tarafındaki kalan işler: [[pmj-google-oauth-dogrulama]]. İlgili: [[pmj-playlist-autosync-2026-08]].
