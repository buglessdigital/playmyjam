---
name: pmj-perf-rework-2026-07
description: "Müşteri paneli hız mimarisi (2026-07-03) — kabuk cache'li, canlı veri client RPC; 0005/0006 uygulandı, 0007 (play_count) hâlâ bekliyor"
metadata: 
  node_type: memory
  type: project
  originSessionId: 92d870af-84af-44b7-a177-3fb1341461c7
---

2026-07-03'te müşteri paneli (`app/venue/[venueId]/*`) instant-navigation mimarisine geçirildi: kabukta yalnızca `use cache` verisi (venue adı, katalog, paketler, track detayı), canlı/kullanıcı verisi client'ta sayfa başına tek Postgres RPC (`get_queue_state`, `get_browse_user_state`, `get_song_user_state`, `get_profile_state`) + mevcut realtime. `/api/queue` `request_song` RPC + `after()` kullanıyor. Middleware/API'lerde `getUser()` → `getClaims()`.

**Why:** Mobilde sayfa geçişleri ve buton tıklamaları 1-3 sn sürüyordu; kök nedenler middleware'deki getUser ağ çağrısı ve sıralı sorgu şelaleleriydi.

**How to apply:** (1) Migration durumu (2026-07-11 canlı DB'de doğrulandı): 0005/0006/0007 hepsi UYGULANDI — play_count trigger'ı ve backfill çalışıyor, JWT signing keys asimetrik ES256'ya geçirilmiş (getClaims ağ çağrısız). Kod production'da (pmj-seven.vercel.app). Not (4 Eyl 2026'da düzeltildi): PMJ'nin Supabase projesi (`rtvnbhifqxdeljijxtpe`) ARTIK MCP'ye bağlı — `execute_sql` ve `apply_migration` doğrudan çalışıyor, migration'ları kullanıcıya yaptırmaya gerek yok. Eski not ("DDL'i ben çalıştıramam, kullanıcı SQL Editor'dan uygular") geçersiz. (2) `getClaims`'in ağ çağrısız çalışması için Supabase Dashboard'da JWT Signing Keys asimetriğe geçirilmeli — geçilmezse getClaims içten getUser'a düşer, kazanç kaybolur. (3) Yeni RPC eklerken deseni koru: security invoker + tek jsonb dönüşü. Bkz [[next16-instant-validation]].
