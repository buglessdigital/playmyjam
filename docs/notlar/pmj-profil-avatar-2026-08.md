---
name: pmj-profil-avatar-2026-08
description: "Müşteri profil avatarı — 12 AI görsel public/avatars/avatar-01..12.webp; 0024 migration uygulandı (avatar_id kolonu), kod prod'da"
metadata: 
  node_type: memory
  type: project
  originSessionId: b42b630c-eec3-424f-a21d-28359b02d2df
  modified: 2026-08-02T08:36:28.489Z
---

2 Ağu 2026'da müşteri profiline avatar seçimi eklendi. Avatarlar yapay zekayla
üretilen 12 müzisyen portresi (6 kadın / 6 erkek, düz vektör, neon pembe-mor
kenar ışığı): `public/avatars/avatar-01.webp` … `avatar-12.webp`.
`lib/avatars.tsx` id↔dosya eşlemesini üretir (`AVATAR_EXT`, `AVATAR_COUNT`
tek noktadan değişir). `profiles.avatar_id` kısa id tutar.

**Why:** Önce kod içi SVG glyph seti yazıldı, kullanıcı beğenmedi — avatar sanatı
AI ile üretiliyor, prompt'ları Claude veriyor. Ham çıktılar 2048px PNG / ~4.7MB
geldiği için repoya o haliyle girmedi.

**How to apply:** Yeni avatar üretirken aynı işlem hattından geçir: %85 merkez
kırpma + üstten %6 kaydırma (yuvarlak kırpmada yüz küçük kalmasın), 512x512,
webp q82, zemin #1a0e2a'ya düzleştir (sharp `node_modules`'ta mevcut). Kaynak
PNG'ler `design/avatar-originals/` altında ve gitignore'da — git yedeklemiyor.
Listeden id SİLME (o id'yi seçmiş kullanıcılar baş harfe düşer); DB kısıtı id'nin
küçük harfle başlamasını şart koştuğu için ad kalıbı `avatar-NN`.
`supabase/migrations/0024_profile_avatar.sql` DDL içerdiği için
[[pmj-perf-rework-2026-07]] kuralı gereği kullanıcının Supabase SQL Editor'ından
uygulanır; `get_profile_state` RPC'sine `avatar_id` bu migration'la eklendi —
uygulanmadan avatar seçimi kalıcı olmaz.
