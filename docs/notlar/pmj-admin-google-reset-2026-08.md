---
name: pmj-admin-google-reset-2026-08
description: Mekan admini kendi giriş bilgilerini değiştirir + Google kurtarma hesabı + şifre sıfırlama maili; 0030 migration ve RESEND_API_KEY şart
metadata: 
  node_type: memory
  type: project
  originSessionId: beb6a049-4409-4658-b82b-b504c11793aa
  modified: 2026-08-08T12:21:11.585Z
---

6 Ağu 2026'da eklendi: mekan admini panel > Ayarlar'dan kullanıcı adı/şifresini
değiştirebiliyor (mevcut şifre doğrulanır), Google hesabını kurtarma adresi
olarak bağlıyor, login ekranında "Şifremi unuttum" sıfırlama maili yolluyor.

DURUM (8 Ağu 2026 doğrulaması): canlıda ve çalışıyor. 0030 uygulanmış,
f0c2f83 origin/main'de, 6 Ağu'da gerçek bir sıfırlama uçtan uca tamamlanmış
(admin_password_resets satırı 31 sn sonra used_at damgalı). Google bağlı
adminler: taner, the-mezzeanine-bar; bağlı OLMAYAN: ogulcan, asim — bu ikisi
şifreyi unutursa kendi kendine sıfırlayamaz, elle müdahale gerekir.

Devreye alma gereksinimleri (tamamlandı):
- `supabase/migrations/0030_admin_google_and_password_reset.sql` uygulandı
  (venue_admins.google_* kolonları + admin_password_resets tablosu).
- `RESEND_API_KEY` TAMAM: 6 Ağu 2026'da Vercel'in üç ortamına ve .env.local'e
  eklendi (Supabase SMTP'dekinden ayrı, "Sending access" kısıtlı yeni anahtar —
  bkz. [[pmj-resend-smtp]]). Env'in canlıda geçerli olması için yeni deploy şart.
  İsteğe bağlı `MAIL_FROM` (varsayılan noreply@playmyjam.com.tr).
- Supabase > Auth > URL Configuration > Redirect URLs listesine
  `https://playmyjam.com.tr/api/admin/google/callback` girmeli (wildcard yoksa).

Kararlar:
- Google bağlama ZORUNLU DEĞİL: bağlamayan admin panelin üstünde kapatılamayan
  uyarı bandı görür (kullanıcının tercihi; kilit istemedi).
- Google yalnızca kurtarma adresi — panele giriş hâlâ kullanıcı adı + bcrypt
  şifre. Callback, Supabase oturumunu `signOut({scope:"local"})` ile kapatır ki
  adminin tarayıcısında müşteri oturumu kalmasın.
- Şifre değişince (panelden ya da sıfırlamayla) `revokeAdminSessions` çağrılır:
  mekan ekranı (player) dahil tüm oturumlar düşer, işlemi yapan sekmeye taze
  çerez basılır. Bkz. [[pmj-auth-rework-2026-07]].

Uçtan uca sıfırlama akışı 6 Ağu 2026'da gerçek mail ile bir kez çalıştı.
