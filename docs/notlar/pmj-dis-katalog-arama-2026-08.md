---
name: pmj-dis-katalog-arama-2026-08
description: "Müşteri araması (15 Eki 2026'dan beri önce ortak havuz, sonra) mekan listesi sonuçlarının altında Apple Music + Deezer'dan sonuç gösterip talebe çevirir (16 Ağu 2026; 5 Eki 2026'dan beri her aramada)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 24526773-70d8-41df-a63d-7e63a0d80b46
  modified: 2026-08-16T15:56:03.795Z
---

Müşteri arama ekranı (`components/browse/SearchView.tsx`) 2+ harfli **her** aramada
`/api/discover?q=` çağırır (5 Eki 2026'ya kadar yalnız mekan listesi boş dönünce —
"manga" aramasında listedeki tek şarkı çıkıp grubun diğer şarkıları hiç görünmüyordu).
Mekan listesi sonuçları üstte, dış sonuçlar altta; dönen kayıtlar normal şarkı satırı gibi
listelenir ama düğmesi "İste"dir ve mevcut serbest metin talep akışını
(`onSuggest` → `/api/venue/[venueId]/request`) tetikler. Amaç: "listede yoksa
isteyebilirsin" yazısını okumayan müşteri bunu sonuçtan anlasın.

**15 Eki 2026'dan beri önce ortak havuz:** `/api/discover` aynı yanıtta önce
`songs` havuzundan (`lib/pool-search.ts`, panel aramasıyla ortak) en fazla 15
sonuç (`inPool: true`), sonra dış kaynakları verir; havuzda karşılığı olan dış
sonuç ayıklanır. Sebep: talep onayında şarkı havuzda bulunursa mekan bildirimden
tek dokunuşla onaylar, bulunamazsa YouTube'a girip bağlantı kopyalamak zorunda
kalıyordu ("Haberin Yok Ölüyorum — Duman" havuzda dururken müşteri cover
sürümlerini de aynı ağırlıkta görüyordu). Havuz sonuçları müşteriye sade
gösterilir: parantezli ek + konuk sanatçı atılınca aynı kalan sürümler teke
iner, alaka (tam eşleşme > tam kelime) izlenmeden önce gelir. Havuz sorgusu
hata verirse yanıt CDN'de yalnız 60 sn tutulur. En az bir kelime 3+ harf değilse
havuz yoklanmaz.

Kaynaklar `lib/discover.ts`: **iTunes Search API** (`country=TR`) + **Deezer public
API** — ikisi de anahtarsız, günlük kotasız. Spotify bilerek seçilmedi (yeni
uygulamalar development mode'da başlıyor + geliştirici politikası verinin başka
müzik servisiyle eşleştirilmesine kapalı). YouTube search.list de seçilmedi:
sorgu başına ~100 birim.

Kritik ayrıntılar:
- Listede zaten olan şarkı dış sonuçlardan ayıklanır: dış başlık listedeki bir
  başlığın **içinde** geçiyor + ana sanatçı tutuyorsa aynı sayılır (YouTube
  başlıkları ekli geliyor). Bedeli: listede yalnız remix'i olan şarkının aslı da
  gizlenir ("Cevapsız Sorular (Mahmut Orhan Remix)" → aslı çıkmaz). Şikâyet
  gelirse kural daraltılır.
- Sıralama **RRF** (`1/(10+sıra)` toplamı). Düz "iki kaynakta da var" sayımı
  cover sürümlerini aslın üstüne çıkarıyordu.
- **Boş sonuç önbelleğe alınmaz** (bellek cache'i de, CDN başlığı da kısa) —
  kaynakların tek bir zaman aşımı sorguyu 24 saat "bulunamadı" bırakıyordu.
- Dış sonuçlarda video id **yok**, çalınamaz; YouTube araması ancak mekan talebi
  onaylayınca yapılır (bkz. [[pmj-talep-onay-akisi-2026-08]]).
- Kapaklar next/image'a sokulmadı (düz `<img>`): sayısız tek kullanımlık görsel
  için optimizasyon dönüşümü israf.
- Migration YOK. Yeni i18n anahtarları: `search.discover*`.

İlgili: [[pmj-oneri-akisi-2026-08]], [[pmj-youtube-quota-2026-07]], [[pmj-i18n-2026-08]]
