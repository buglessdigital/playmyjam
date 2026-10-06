---
name: pmj-google-link-gate-2026-08
description: "Yeni mekan adminleri ilk girişte Google bağlamaya zorlanır; 0038 migration ŞART, mevcut mekanlar muaf"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8bc52662-8216-4c93-a156-efb7e114b811
  modified: 2026-08-08T13:28:06.524Z
---

8 Ağu 2026: Yeni açılan mekanların admini, Google kurtarma hesabı bağlamadan panelin hiçbir yerini (player dahil) açamıyor. Kilit `venue_admins.google_link_required` kolonundan (0038) geliyor; migration mevcut tüm satırları `false` yapıyor, yani ZATEN ÇALIŞAN mekanlar kilitlenmiyor — onlar eski `GoogleLinkBanner` uyarısını görmeye devam ediyor. Bir mekanı elle muaf tutmak için bu kolonu false yapmak yeterli.

Uygulama noktaları:
- `lib/admin-session.ts`: tek sorgu + 30 sn önbellek artık `session_version` yanında `google_sub` ve `google_link_required` de okuyor. `getVerifiedAdminSession(req, { allowPendingGoogleLink })` — bayrak verilmezse beklemedeki oturum **null** döner, yani tüm admin API'leri kendiliğinden kapanır.
- `proxy.ts`: beklemedeyse `/admin/{slug}/link-google`'a, bağlandıysa oradan panele yönlendirir.
- Google callback zorunlu akışta hatayı `/link-google`'a, başarıyı panel ana ekranına yollar; `google_link_required=false` yazıp `forgetAdminState` ile kilidi anında kaldırır.

**Why:** Kurtarma hesabı olmayan admin şifresini unutunca tek çare super admin'e yazmaktı; uyarı bandı yeterince ciddiye alınmıyordu.

**How to apply:** 0038 SQL'i kullanıcı Supabase SQL Editor'da ÖNCE çalıştırmalı — kolon yokken satır okuması hataya düşer ve `session_version` iptali de (fail-open olduğu için) devre dışı kalır. İlgili: [[pmj-admin-google-reset-2026-08]]
