---
name: pmj-playing-cooldown-2026-08
description: "Çalan şarkı kilidi + 30 dk cooldown'ın başlangıç anına taşınması; 0025 migration kullanıcının SQL Editor'ından uygulanmalı"
metadata: 
  node_type: memory
  type: project
  originSessionId: dfdb68fd-e3df-44a8-ad92-df8ef06b9ca1
  modified: 2026-08-02T09:59:03.548Z
---

2 Ağu 2026'da yazıldı. Kurallar netleşti:
- Sahnedeki şarkı (kaynağı ne olursa olsun, auto dahil) çaldığı sürece sıraya eklenemez.
- Müşteri isteğiyle çalan şarkı, ÇALMAYA BAŞLADIĞI andan itibaren 30 dk hem eklenemez
  hem de auto-fill tarafından tekrar kuyruğa alınmaz (`lib/queue-fill.ts`).
- auto-fill'in çaldığı şarkılar (user_id null) için 30 dk yok; bitince hemen tekrar çalabilir/eklenebilir.

Çapa için `queue.started_at` kolonu eklendi (playNextFromQueue yazar); eski satırlarda
`coalesce(started_at, played_at)` ile geriye dönük uyum var.

**Durum:** 0024 + 0025 kullanıcı tarafından uygulandı, kod 2 Ağu 2026'da prod'a
deploy edildi (4375b7d).

Doğrulama notu: yeni kolonu `select` ile yoklamak yanıltıcı olabiliyor — PostgREST
şema cache'i birkaç dakika bayat kalıp "column does not exist" (42703) döndürüyor.
Kesin test: kolona dokunan RPC'yi çağır (fonksiyon gövdesi DB'de çalışır, cache'e
bakmaz). Kolon adını da migration dosyasından teyit et (0024 `avatar_id`, avatar_key değil).
