---
name: pmj-admin-reset-case-2026-08
description: Admin girişi/şifre sıfırlama artık harf duyarsız; sıfırlama sessiz başarısızlığın gerçek sebebi kullanıcı adı yazımıydı
metadata: 
  node_type: memory
  type: project
  originSessionId: 5d4d7a00-4fe3-47de-b0e1-4708c3ffe3f4
  modified: 2026-08-08T12:36:11.900Z
---

8 Ağu 2026: "şifre sıfırlama maili gitmiyor" şikayetinin sebebi Resend değildi —
mail altyapısı çalışıyor (prod `/api/admin/password-reset` `ok:true` döndü, gerçek
mail ulaştı). Sebep: `venue_admins.username` `eq()` ile birebir aranıyordu, harf
farkı ya da yanlış yazım hesabı "yok" gösteriyor ve endpoint bilgi sızdırmamak için
yine "gönderildi" mesajı dönüyordu. The Mezzanine Bar'ın kullanıcı adı veritabanında
yazım hatalı: `the-mezzeanine-bar` (slug ise `the-mezzanine-bar`) — düzeltilmedi,
mekana bu adla şifre verildi.

Çözüm `lib/admin-username.ts`: `likePattern()` + `ilike` ile harf duyarsız arama
(login, password-reset, credentials, super-admin create/update). Desen kaçırma ŞART —
kaçırılmamış `%` bütün adminleri eşliyor.

**Why:** Aynı semptom ileride tekrar gelirse önce Resend'e bakmak zaman kaybı.
**How to apply:** Sıfırlama maili gitmiyorsa sırayla bak: (1) `google_email` dolu mu —
berkay/ogulcan/asim'de Google bağlı DEĞİL, onlarda sıfırlama hiçbir zaman çalışmaz,
(2) kullanıcı adı yazımı, (3) sunucu logunda `[admin-reset] gönderilmedi` uyarısı.

İlgili: [[pmj-admin-google-reset-2026-08]], [[pmj-resend-smtp]]
