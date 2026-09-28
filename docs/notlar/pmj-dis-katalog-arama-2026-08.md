---
name: pmj-dis-katalog-arama-2026-08
description: "Müşteri araması mekan listesinde boş dönünce Apple Music + Deezer'dan sonuç gösterip talebe çevirir (16 Ağu 2026)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 24526773-70d8-41df-a63d-7e63a0d80b46
  modified: 2026-08-16T15:56:03.795Z
---

Müşteri arama ekranı (`components/browse/SearchView.tsx`) mekan listesinden **hiç**
sonuç çıkmazsa `/api/discover?q=` çağırır; dönen kayıtlar normal şarkı satırı gibi
listelenir ama düğmesi "İste"dir ve mevcut serbest metin talep akışını
(`onSuggest` → `/api/venue/[venueId]/request`) tetikler. Amaç: "listede yoksa
isteyebilirsin" yazısını okumayan müşteri bunu sonuçtan anlasın.

Kaynaklar `lib/discover.ts`: **iTunes Search API** (`country=TR`) + **Deezer public
API** — ikisi de anahtarsız, günlük kotasız. Spotify bilerek seçilmedi (yeni
uygulamalar development mode'da başlıyor + geliştirici politikası verinin başka
müzik servisiyle eşleştirilmesine kapalı). YouTube search.list de seçilmedi:
sorgu başına ~100 birim.

Kritik ayrıntılar:
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
