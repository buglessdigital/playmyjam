---
name: pmj-talep-youtube-arama-2026-10
description: 15 Eki 2026 — havuzda olmayan talep önce YouTube'da aranır (search.list, günlük tavanlı); kota/tavan bitince bağlantı yapıştırmaya düşer; migration yok
metadata:
  type: project
---

15 Eki 2026: kullanıcı isteğiyle `search.list` (100 birim) **yalnız talep onayı
için** geri geldi. Sıra: ortak havuz (0 birim) → YouTube araması → admin bağlantı
yapıştırır.

- Arama talep DÜŞERKEN yapılır (`notifyAdminsOfRequest`, `after()` içinde):
  bulunursa bildirimde "Onayla" düğmesi olur, sonuç `search_cache`'e yazılır ve
  onay anında `findInPool` oradan bedava okur — ikinci arama yok.
- **Eşleşme yoksa ilk sonuç alınmaz** (admin kör onaylıyor); boş sonuç
  önbelleğe yazılır, aynı talep için 100 birim tekrar yakılmaz.
- **Günlük tavan:** `lib/youtube-search-budget.ts`, varsayılan 30 arama
  (3.000 birim), env `YOUTUBE_SEARCH_DAILY_CAP` ile değişir (0 = kapalı).
  Sebep: aynı 10.000'lik kotayı catalog-new, metadata tazeleme ve playlist
  senkronu paylaşıyor ve gün sonunda koşuyorlar (bkz. [[pmj-katalog-hasadi-2026-09]]).
- Durum `app_settings.youtube_search_usage` satırında `{day, count, exhausted}`
  (gün = Pasifik tarihi, kota orada sıfırlanır). Google 403 "quota" dönerse
  `exhausted` olur, gün bitene kadar arama kapalı. Migration yok.
- Panelde sarı yapıştırma kartı artık sebebi yazar (kota doldu / bulunamadı).

İlgili: [[pmj-talep-onay-akisi-2026-08]], [[pmj-kotasiz-mimari-2026-08]], [[pmj-youtube-quota-2026-07]]
