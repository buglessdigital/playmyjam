---
name: pmj-auth-rework-2026-07
description: "Auth durumu — müşteri paneli 2026-08-01'de misafir erişimine açıldı; şifre sıfırlama, hesap silme, rate limit, oturum iptali, venue-scope; kalan boşluklar süper adminde"
metadata: 
  node_type: memory
  type: project
  originSessionId: 03b70662-b3a3-47b8-8a87-73012e438a33
  modified: 2026-08-01T09:18:13.991Z
---

2026-07-30'da auth güçlendirme turu canlıya alındı (commit `b4ac86b`, prod `playmyjam.com.tr`). Devrede: `/auth/reset` şifre sıfırlama (token_hash + PKCE `?code=` + implicit hash biçimlerinin üçünü de karşılar; canlıda uçtan uca doğrulandı — mail geliyor, form açılıyor, şifre değişiyor), ayarlarda şifre değiştir/belirle + e-posta değiştir + hesap silme (KVKK; ödeme kayıtları silinmez, 0020 ile kullanıcıdan koparılır), veritabanı tabanlı hız sınırlayıcı (admin/super-admin girişi ve `/api/search`), admin oturumu iptali (`venue_admins.session_version`), venue-scope kontrolü (mekan çerezi path `/` oldu, `request`/`queue`/`checkout` uçlarında doğrulanıyor), `/api/search` ve `/api/lyrics`'e giriş şartı. Migration 0018-0021 uygulandı. Custom SMTP kurulu — bkz. [[pmj-resend-smtp]].

**2026-08-01 — müşteri panelinde giriş artık zorunlu değil** (commit `6b2b16d`, 0022 uygulandı, prod'da canlı; yönlendirmeler ve anon RPC'ler canlıda doğrulandı, gerçek cihazda misafir→giriş turu HENÜZ atılmadı). QR'dan gelen `/venue/{slug}` doğrudan `/queue`'ya gider; `/queue`, `/browse` ve `/song/*` misafire açık. Giriş formu `/venue/{slug}/page.tsx`'ten `/venue/{slug}/login`'e taşındı (kök artık yalnızca redirect). Hesap gerektiren her şey (jeton, favori, geçmiş, istekler, profil, ayarlar, ödeme yöntemleri + arama kutusu, çünkü `/api/search` YouTube kotası yakıyor) `?next=` ile login'e yönlendirir. İki katman: `proxy.ts` sayfa erişimini, API rotaları da eskisi gibi `hasVenueSession`'ı zorlar; istemci tarafı gating yalnızca `venue_member_{slug}` adlı **httpOnly OLMAYAN** ipucu çerezini okur (`lib/venue-gate.ts` → `useVenueGate`), yetki hâlâ httpOnly `venue_auth_{slug}`'ta. Migration **0022** sayfa RPC'lerini (`get_queue_state`, `get_browse_user_state`, `get_song_user_state`) anon'a açar ve `auth.uid()` null iken cüzdan/favori tablolarına hiç dokunmaz.

Daha önceki tur (2026-07-12): OAuth callback tek-response deseni, proxy'de kayan 180 günlük `venue_auth_*` çerezi, `/auth/confirm` ile onay linkinden otomatik giriş.

**Kayıt e-posta onayı bilinçli olarak KAPALI** (`mailer_autoconfirm: true`, karar 2026-07-30): kullanıcı QR okutup şarkı isteyecek, onay adımı gereksiz sürtünme. Yani "Confirm sign up" şablonu kullanılmıyor; ulaşılabilir tek şablon "Change email address". Kod iki durumu da destekliyor, toggle geri açılırsa değişiklik gerekmez. Kabul edilen takas: adresini yanlış yazan kullanıcı bunu öğrenmiyor, şifre sıfırlama ona ulaşmıyor ve satın aldığı jetona erişemez — Google girişi bu riski taşımıyor.

Kalan boşluklar: süper admin tek paylaşılan env şifresiyle korunuyor (2FA yok, oturum iptali yok — tek yol `SUPER_ADMIN_PASSWORD`/`SESSION_SECRET` döndürmek), mekan admini kendi şifresini değiştiremiyor, müşteride "tüm cihazlardan çıkış" yok, gizlilik metninde hesap silme hakkı yazılı değil.

**Why:** Auth ayarlarının bir kısmı hosted dashboard'da, repo'dan yönetilemiyor ([[pmj-perf-rework-2026-07]] — DDL/config kullanıcının elinden).
**How to apply:** E-posta şablonları artık `{{ .ConfirmationURL }}` kullanıyor (kaynak: `docs/email-templates/`); kod hem bu biçimi hem `token_hash` biçimini karşılıyor, ama değişken silinirse link tümden ölür. Korumalı sayfaya inen onay linkleri `proxy.ts` tarafından parametre kaybetmeden `/auth/confirm`'e taşınıyor — "onay linki login'e atıyor" bug'ı bu yüzden geri gelmemeli. Hız sınırlayıcı sayacı ÜRETİM veritabanında paylaşımlı: test ederken `rate_limit_hits` tablosundaki `admin-login:*` satırlarını temizle, yoksa gerçek admin 15 dakika kilitli kalır.
