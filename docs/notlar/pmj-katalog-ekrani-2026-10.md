---
name: pmj-katalog-ekrani-2026-10
description: Super admin Katalog ekranı (1 Eki 2026) — havuzda arama + hasat turunun canlı durumu; 0064+0065 ŞART
metadata:
  type: project
---

`/super-admin/catalog` (+ `app/api/super-admin/catalog/route.ts`): ortak havuzda arama ve hasat turlarının ilerleme çubuğu. **0064 (catalog_runs) + 0065 (catalog_artist_count RPC) ŞART** — tablosuz ekran çökmez ama "Son turlar" boş, sanatçı sayısı yerine "…" görünür.

**Why:** Havuz 900 bini aşmasına rağmen "aradığım şarkı yok" şikâyeti sürüyordu; katalog boşluğu mu arama sorunu mu olduğunu ayırmak için havuza doğrudan bakılabilen bir yer gerekiyordu (örn. "mor ve ötesi – Cambaz" istenip reddedilmiş ama şarkı havuzda VAR). İlerleme çubuğu da hasadın geliştirici makinesinde çalışan elle bir betik olmasından: terminal kapanınca tur sessizce ölüyor ve bunu kimse görmüyordu.

**How to apply:** (1) Hasat ilerlemesi `catalog_runs`'a yazılıyor (`runStart/runBeat/runFinish`, scripts/seed-catalog.ts). Yazma hataları turu DÜŞÜRMEZ — ilerleme kaydı işin seyir defteri, işin kendisi değil. Nabız 5 sn'de bir atılır; `heartbeat_at` 2 dakikadır bayatsa ekran turu `stale` ("kesildi") gösterir, çünkü tablodaki `status` hâlâ `running` kalır (betik öldüğünde kendini kapatamaz). (2) **Arama en az 3 harf:** trigram indeksi daha kısa parçalarda devre dışı kalıyor, ölçümde "ad" 5,2 sn, "sem" 1,8 sn, "tarkan kuzu" 1,4 sn sürdü. (3) Sonuçlar kasten **olduğu gibi** gösterilir: kopyalar ayıklanmaz, `embeddable=false` kayıtlar da listelenir ("çalınamaz" etiketiyle) — ekranın işi havuzu olduğu gibi göstermek. (4) Farklı sanatçı sayısı `count distinct` olduğu için PostgREST'ten alınamıyor, 0065 RPC'si var ve yalnızca sayfa ilk açılışında (`?full=1`) çağrılıyor; 5 saniyelik yoklamalar şarkı sayısını `estimated` sayımla alır. (5) Panelin kuralı: effect gövdesinde senkron `setState` ve render içinde `Date.now()` lint hatası — promise zinciri + `useNow` kullanılır. Bkz. [[pmj-katalog-hasadi-2026-09]], [[pmj-katalog-talep-yonlu-2026-09]], [[pmj-songs-trigram-2026-09]].
