---
name: pmj-oneri-akisi-2026-08
description: "1 Ağu 2026: müşteri paneli YouTube aramasından çıkarıldı — yerel arama + serbest metin öneri akışı (0023 migration şart)"
metadata: 
  node_type: memory
  type: project
  originSessionId: a1f35e12-4a46-4123-94f1-c4cf0289141c
  modified: 2026-08-01T14:01:25.239Z
---

YouTube kota artışının nihai yanıtı beklenmeden mekanlara kurulum yapılabilsin diye
müşteri paneli YouTube aramasından tamamen ayrıldı (bkz. [[pmj-youtube-quota-2026-07]]).

- **Müşteri araması yerel:** `components/browse/SearchView.tsx` artık `/api/search`'e hiç
  gitmez; `venueSongMap` üzerinde (`in_venue_list` olanlar) filtreler. Arama misafire de açık
  (eskiden kota yüzünden giriş şartı vardı).
- **Öneri kutusu:** sonuç yoksa arama ekranının üstünde şarkı adı + sanatçı formu çıkar
  (sonuç varsa listenin altında katlanmış). POST `/api/venue/[venueId]/request` gövdesi
  `{suggested_title, suggested_artist}` ise öneri dalı çalışır: giriş + mekan oturumu şart,
  kişi başına 10 dk'da 5 öneri, aynı kişinin aynı bekleyen önerisi tekrar eklenmez.
- **Şema:** `supabase/migrations/0023_song_suggestions.sql` — `song_requests.song_id` nullable,
  `suggested_title/suggested_artist` kolonları + check constraint. **Kod bu SQL'den ÖNCE
  deploy edilirse admin istekler sayfası boş görünür** (PostgREST bilinmeyen kolonda hata verir).
- **Otomatik kapanma:** `lib/suggestions.ts` → `resolveMatchingSuggestions`. Mekan şarkıyı
  YouTube playlist'ine ekleyip panelden "Playlist Ekle" ile yeniden içe aktarınca (veya panel
  içi aramayla tek tek eklerken) eşleşen öneri `song_id`'ye bağlanıp `accepted` olur ve
  müşteriye push gider. Eşleşme: öneri başlık+sanatçı kelimelerinin tamamı şarkının
  başlık/sanatçı/kanal metninde geçecek (fold + gürültü kelime elemesi, 8/8 örnekte doğru).
- **`/api/search` artık yalnız admin/super-admin oturumuna açık** — YouTube kotası tamamen
  mekan paneline indi, müşteri trafiği kota yakmıyor.
- Admin istekler sayfasında öneriler "Öneri" rozetiyle, "YouTube'da Bul" (hazır arama linki) +
  "Eklendi"/"Reddet" ile görünür. Müşteri tarafında `/venue/[id]/requests` içinde
  "Mekana Önerdiklerin" bölümü durum gösterir.

**Why:** Kota onayı gelmeden de mekan kurulumu yapılabilsin; onay gelirse YouTube araması
müşteri paneline geri açılabilir (SearchView'daki yerel filtre + öneri kutusu kalabilir).
**How to apply:** 0023'ü Supabase SQL Editor'dan uygula, sonra deploy et.
