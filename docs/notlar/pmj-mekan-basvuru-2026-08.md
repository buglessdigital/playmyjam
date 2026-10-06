---
name: pmj-mekan-basvuru-2026-08
description: "Ana sayfadaki mekan kayıt formu + super admin \"Mekan Talepleri\" ekranı; 0028 migration ŞART"
metadata: 
  node_type: memory
  type: project
  originSessionId: 0593996b-793a-469f-abe6-20d1c1c685f4
  modified: 2026-08-03T11:57:19.304Z
---

3 Ağustos 2026'da eklendi: ana sayfaya (`/#mekan-basvuru`) mekan sahipleri için kayıt
formu, super admin paneline `/super-admin/applications` ("Mekan Talepleri") listesi.

**Why:** Mekan sahipleri daha önce yalnızca e-posta/telefonla ulaşabiliyordu; talepler
hiçbir yerde kuyruğa girmiyordu.

TAMAM: 0028 uygulandı, commit 20d8c73 prod'da (playmyjam.com.tr), form uçtan uca
doğrulandı — canlıya bir "Deploy Kontrol" test satırı düştü, panelden silinmeli.

**How to apply:**
- `supabase/migrations/0028_venue_applications.sql` uygulandı (3 Ağu 2026).
  Yeni ortama kurulumda kod deploy'undan ÖNCE çalıştır — tablo yokken form 500 döner.
- `venue_applications` tablosunda RLS açık ama **politika yok**: hem yazma hem okuma
  yalnızca service-role route handler'larından geçer (`/api/venue-applications` POST,
  `/api/super-admin/applications` GET + `[id]` PATCH/DELETE).
- Spam savunması: gizli `website` bal küpü alanı + IP başına saat başı 3 gönderim
  (`consume_rate_limit`, bkz. [[pmj-auth-rework-2026-07]] altyapısı).
- Statüler: `new | contacted | approved | rejected`. Onaylanınca panel
  `/super-admin/venues/new?name=...` kısayoluna gider — bu yüzden o sayfa
  `NewVenueForm.tsx` + Suspense saran `page.tsx` olarak ikiye ayrıldı
  (useSearchParams statik sayfada Suspense ister, bkz. [[next16-instant-validation]]).
- Mekan hesabı hâlâ elle açılıyor; form yalnızca talep kuyruğu.
