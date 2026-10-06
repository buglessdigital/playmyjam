---
name: pmj-songs-trigram-2026-09
description: songs ~830 bin satır; ilike/imatch havuz aramaları trigram indeksi (0056) olmadan timeout'a düşüyor
metadata:
  type: project
---

24 Eyl 2026: hasat sonrası `songs` ~829 bin satır. `findInPool` (talep onayı) ve `/api/search`
(panel şarkı arama) `ilike '%..%'` / `imatch` ile tarıyor; indeks yoktu → 8 sn statement timeout
(57014). Hata yutulduğu için talep "havuzda yok" sayılıp YouTube linki isteniyordu — başka mekanda
çalmış şarkı için bile. Çözüm `supabase/migrations/0056_songs_trigram_search.sql` (pg_trgm GIN,
title + artist). 0056 24 Eyl 2026 UYGULANDI (768f2f1): talep araması 8 sn timeout → 0,38 sn. Push artık urgency=high (2408726).

**Why:** Havuz büyüdükçe indekssiz metin araması sessizce bozuluyor; hata "sonuç yok"la karışıyor.
**How to apply:** songs üzerinde yeni metin araması yazarken trigram indeksine dayandığını doğrula;
REST'ten `count=exact` bile timeout veriyor, `count=estimated` kullan. İlgili: [[pmj-katalog-hasadi-2026-09]],
[[pmj-talep-onay-akisi-2026-08]]
