---
name: pmj-playlist-queue-2026-08
description: "Playlist kuyruğu + play tuşu (0037): is_active öldü, queue_position geldi; 13 Ağu 2026'dan beri kuyruk TÜKETİLİR — turunu bitiren liste düşer, yalnızca son liste döner"
metadata: 
  node_type: memory
  type: project
  originSessionId: a4d74b50-917f-4818-9a53-986a6b006810
  modified: 2026-08-16T10:40:41.592Z
---

7 Ağu 2026: playlist'ler artık "aktif/pasif" değil, bir ÇALMA KUYRUĞU. Panelde
her listenin play tuşu var (Spotify gibi): basınca rotasyon imleci o listeye
atlar, liste baştan başlar, kuyrukta bekleyen `auto` satırlar o listeden
yeniden dolar — sahnedeki şarkı kesilmez, müşteri istekleri hiç etkilenmez.

**Why:** Kullanıcının tek kırmızı çizgisi: "sonsuz döngüyü hiçbir zaman
öldürmek istemeyiz." Bu yüzden listeler tüketilip düşmüyor — döngü kuyruğun
KENDİSİNDE: son liste bitince kuyruk başa döner (cycle +1), yani 0032 motoru
aynen yaşıyor, play tuşu yalnızca imleci elle taşıyor.

**How to apply:**
- `playlists.queue_position` (null = sırada değil) kuyruğu tanımlar; `is_active`
  kolonu duruyor ama HİÇBİR yerde okunmuyor (geri dönüş kolaylığı için bırakıldı).
- `playlists.play_once` kolonu DB'de duruyor ama 13 Ağu 2026'dan beri hiçbir
  yerde okunmuyor/yazılmıyor (aşağıdaki güncellemeye bak).
- Katalogdan karışık çalma artık "listeler bitince" değil iki halde: kuyruk boş,
  ya da kuyruktakilerde şu an çalınabilir şarkı yok (hepsi kuyrukta/30 dk
  kilidinde). İkincisi GEÇİCİ dolgu — `source_playlist_id` null girer, tüketilmiş
  sayılmaz. `fillQueueToTen` eksik kalan boşluğu katalogdan tamamlar.
- Tur (cycle) yalnızca kuyruktaki TÜM listeler gerçekten tükendiyse artar —
  sadece cooldown yüzünden atlanan listenin ilerlemesi silinmez (0032'deki
  sessiz hata burada kapandı).
- API: `PATCH /api/admin/playlists` → `{play:true}`, `{queued:bool}`,
  `{play_once:bool}`, `{queue_order:[ids]}` (kuyruk sırası) ve eski
  `{order:[ids]}` (yalnızca sırada olmayanların ray görünümü).
- `playPlaylistNow()` ve `nextQueuePosition()` `lib/queue-fill.ts`'te.
- Rayda sıralama: önce kuyruk (çalma sırasıyla), sonra sıradışılar. Taşıma kendi
  grubu içinde çalışır.

**10 Ağu 2026 — play tuşu artık SAHNEYİ de alır:** basınca listenin ilk şarkısı
(karıştırmalıysa rastgele biri) anında çalar; kuyruk devamıyla dolar. Tek istisna
sahnedeki müşteri şarkısı — kesilmez, liste onun (ve sıradaki müşteri
isteklerinin) arkasından baştan çalar. `pickPlaylistOpener` 30 dk kilidini yok
sayar (admin bilerek basıyor), embed/katalog elemesi durur. Yanıt `video_id`
döndürüp panel `stageTakeover` ile player'a doğrudan "yükle" der.
Gecikme kuralı: "şimdi çal" yollarında SENKRON kalan tek iş sahnedir
(`playSongNow(..., { deferQueueWork: true })`); imleç/temizlik/dolum `after()`'a
gider. İlk sürümde hepsi senkrondu ve düğme ~2 sn bekletiyordu.
Ayrıca `jumpPlaylistCursorTo` karıştırmalı listede artık YALNIZCA seçilen şarkıyı
tüketilmiş sayar (eskiden sıra numarasına kadar olan her şeyi siliyordu → listenin
yarısı turu kaçırıyordu).

**Tuzak (10 Ağu 2026):** `playlist_rotation.playlist_id` "çalan liste" DEĞİL,
"bir sonraki dolum nereden" imlecidir. Kuyruk 10 şarkı ileriyi tuttuğu için
liste bitmeden imleç sıradakine kayar — panelde rozet yanlış listeye geçiyordu
(listenin ortasından şarkı çalınca en görünür hali). Artık "çalan liste"
kuyruktan okunuyor: sahnedeki satırın `source_playlist_id`'si, o null ise
sıradaki ilk playlist satırınınki (`usePlayback.playingListId` →
`useLibrary(…, playingListId)`); imleç yalnızca yedek.

**13 Ağu 2026 — kuyruk artık TÜKETİLİR (döngü kuralı değişti):** "A çalıyor, B
sırada" iken A bitince B çalıyordu ama A kendiliğinden yeniden sıraya giriyordu.
Artık turunu bitiren liste `queue_position=null` olup kuyruktan düşer (consumed
satırları da silinir, sonra elle geri alınırsa baştan çalar). **Tek istisna:
kuyrukta kalan SON liste düşmez, cycle+1 ile baştan çalar** — kullanıcının kararı
(tek listeli mekan sessizce katalog yedeğine kaymasın). Kod: `pickFromRotation`
içinde `remaining.length === 0 && othersLeft` (`othersLeft = active.length -
finishedOnce.size > 1`). Hiç çalmamış listeler düşmez; imleç sona gelince onlara
döner, o yüzden raydaki imleç-öncelikli sıralama (`queueRail`) aynen geçerli.
"Tek seferlik" düğmesi panelden KALDIRILDI (kural artık her listede aynı);
`play_once` API alanı da kalktı. Migration YOK, sadece kod.

**13 Ağu 2026 (2) — "10 şarkılık kayan pencere" KALKTI:** kuyruk artık sıradaki
listeler bitip başa saracağı noktaya kadar dolduruluyor (`QUEUE_CAP = 500`
emniyet tavanı; `QUEUE_FLOOR = 10` yalnızca listelerden şarkı çıkmadığında
katalogdan doldurulan taban). `fillQueueToTen` → **`fillQueue`** oldu. Böylece
panelde/player'da görünen sıra GERÇEK: "listenin 18. şarkısını çal" dendiğinde
19, 20, sonra sıradaki listenin 1, 2… diye yazılıyor.
- "Bitti" kararı artık kuyruğa bakıyor: `unconsumed(liste)==0 && kuyrukta o
  listeden bekleyen satır yok`. Sahnedeki listenin satırı bitene kadar düşmez.
  Hepsi bittiyse survivor (sahnedeki ya da imleçteki) düşmez, ilerlemesi silinip
  baştan çalar — `cycle` ARTIK ARTMIYOR, başa sarma tek listenin consumed
  satırlarını silerek yapılıyor.
- 30 dk kilidi yalnızca kuyruğun ilk 10 sırasına uygulanıyor (`soon`); gerisi
  zaten kilit süresinden sonra çalacak.
- Panel/player Realtime'ı 250 ms debounce edildi (tek dolum yüzlerce satır
  yazıyor → yüzlerce tam kuyruk sorgusu oluyordu). PostgREST `in(...)` çağrıları
  100'lük parçalara bölündü (URL sınırı).
- Rayda "Çalıyor 12/40" artık `consumed - kuyrukta bekleyen`
  (`usePlayback.pendingByList` → `useLibrary.playedByList`); çıplak consumed
  daha ilk anda 40/40 gösterirdi.
- `/admin/[venueId]/player` ekranındaki `QUEUE_LIMIT` 10 → 500.
- **Derin kuyruğun bedeli: her değişiklik artık dolumu TETİKLEMEK ZORUNDA.**
  10'luk pencerede eksikler birkaç şarkı içinde kendiliğinden kapanıyordu; şimdi
  kuyruk zaten dolu olduğu için yeni liste/şarkı kendiliğinden görünmez.
  Eklenen tetikler: listeyi sıraya alma (pozisyon >1 → `fillQueue`), kuyruk
  sırasını değiştirme (`queue_order` → `resetAutoQueue`), playlist'e şarkı ekleme
  (`fillQueue`) ve şarkıyı listeden çıkarma (bekleyen otomatik satırı düşür +
  `fillQueue`). Yeni bir yazma yolu eklerken bunu unutma.

**13 Ağu 2026 (3) — "Sıraya ekle" artık Spotify mantığı (BÜYÜK DEĞİŞİKLİK):**
Kuyrukta üç sınıf var, sıralama pozisyon bantlarıyla kuruluyor
(`priority desc, position asc`):
`0` müşteri öncelikli → `1..N` müşteri normal → **`5001..6999` elle eklenen TEKLİ
şarkılar** → **`7001..8999` sıraya eklenen PLAYLIST'ler** (ikisi de
added_by='admin') → `9001+` çalan listenin otomatik dolumu. Yani elle eklenen
şarkı/liste çalan şarkıdan hemen sonra çalar ama müşterinin jetonla aldığı
sıranın ARKASINA girer (kullanıcının kararı).
- Bir listeyi "sıraya ekle" artık `queue_position` YAZMAZ; listenin şarkıları tek
  blok halinde kuyruğa yazılır (`enqueueManual` + `playlistSongsForQueue`). Blok
  bitince çalan liste kaldığı yerden devam eder. Listelerin birbiri ardına
  dizildiği eski "playlist kuyruğu" (tur rozetleri 1,2,3 + sürükleyip sıralama)
  KALKTI; `queue_position` artık pratikte yalnızca ÇALAN listede dolu.
- Elle sıra İKİ ŞERİT: tekliler HER ZAMAN sıraya eklenen listelerin üstünde
  çalar; her şerit kendi içinde FIFO (yeni eklenen aynı şeritte sona girer) ve
  şeritler birbirini etkilemez. Şerit `source_playlist_id` null mu değil mi ile
  seçilir. 13 Ağu'da kısa süre tek şeritli LIFO denendi ("en son eklenen en
  üstte"), kullanıcı geri aldırdı — tekrar önerme.
- Elle eklemede TEKRAR ENGELİ YOK: zaten kuyrukta (hatta sahnede) olan şarkı da
  sıraya alınabilir, iki kez çalar. Sunucudaki "zaten sırada" 409'ları ve
  panelde "Zaten sırada" kilidi kaldırıldı; müşteri tarafındaki kural
  (request_song, 0005) duruyor. Otomatik dolum yine kendi bloğuna aynı şarkıyı
  ikinci kez koymaz (excludeIds).
- "Sırayı temizle" (kuyruk panelinde, `PATCH /api/admin/queue {clear:"manual"}`)
  yalnızca elle eklenenleri siler — çalan listenin şarkılarına ve müşteri
  satırlarına dokunmaz.
- Elle ekleme otomatik dolumdan ÖNCELİKLİ: tavan doluysa en sondaki otomatik
  satırlar düşürülüp (tüketimleri geri alınarak) yer açılır.
- Kuyruk paneli Spotify gibi BLOKLARA ayrılmış durumda: "MÜŞTERİ İSTEKLERİ" /
  "SIRAYA EKLENEN ŞARKILAR" / "SIRAYA EKLENEN LİSTE · <ad>" (her liste ayrı blok)
  / "ÇALAN LİSTEDEN · <ad>" başlıkları blok değiştiğinde çiziliyor; elle eklenenlerin yeşil şeridi + satırda "sıraya
  eklendi" ibaresi var (`QueuePane.groupOf`).
- Panelde "sırada mı" bilgisi artık playlist satırından değil KUYRUKTAN okunuyor:
  `usePlayback.manualByList` → `useLibrary.queuedByList`.
- **ÇALAN PLAYLIST TEKTİR** (13 Ağu): kuyruğun otomatik bloğu her zaman tek
  listeye aittir. `makeSolePlayingPlaylist()` hedefe `queue_position=1` verip
  diğer TÜM listeleri null'lar + ilerlemelerini siler; hem play tuşu
  (`playPlaylistNow`) hem "listenin ortasından şimdi çal" (`jumpPlaylistCursorTo`)
  bunu çağırır. Önceden yalnızca play tuşu eskisini düşürüyordu, şarkıdan çalma
  iki listeyi birden rotasyonda bırakıyor ve kuyruk ikisinden birden doluyordu.
  `nextQueuePosition()` bu yüzden SİLİNDİ. Katalogdan ("Tüm Şarkılar") çalınan
  şarkı playlist_id yollamaz — çalan liste değişmez, bu bilinçli.

**16 Ağu 2026 — elle ekleme çalan listenin kopyasını DEVRALIR:** Mezzanine'de
15 Ağu gecesi admin'in "sıraya ekle" ile öne aldığı 4 şarkı (hepsi çalan listenin
içinden) kuyrukta ikinci kez duruyordu — elle ekleme rotasyon defterine hiç
yazmıyor, otomatik kopyayı da düşürmüyordu. `enqueueManual` artık
`consumeAutoDuplicates()` ile aynı şarkının BEKLEYEN `auto` satırını düşürüp
tüketimi teyit ediyor (0035'in müşteri kuralının admin karşılığı). Sahnedeki
satıra, müşteri satırına ve daha önce elle eklenmişlere dokunulmaz — "admin
bilerek iki kez ekleyebilir" kuralı yalnızca otomatik dolumun kopyası için
gevşetildi. Migration YOK.
Not: "araya 4-5 yabancı şarkı girdi" şikayeti geldiğinde önce bunu doğrula —
`5001+` bandı tasarımı gereği listenin TAMAMININ önüne geçer, arıza değil.

**16 Ağu 2026 (2) — SIRA ARTIK ÇALMA GEÇMİŞİNE ÇAPALI (değişmez kural):**
`lib/rotation-order.ts` → `orderFromResume()`; `pickFromRotation` sıralı listenin
adaylarını "bu turda en son çalınan şarkıdan İLERİ" tarar, başa yalnızca sıra
listenin sonuna gelince döner. Çapa İKİ koşul birden arar: şarkı fiilen çalmış
OLACAK ve bu turda tüketilmiş sayılacak — yalnız geçmişe bakılsa raydan düşüp
geri alınan liste baştan çalmaz, yalnız deftere bakılsa hata geri gelir.
**Why:** kuyruk liste sonuna kadar yazıldığı için başa sarma kuyruk doluyken
yapılıyor; sonraki turun şarkıları aynı `cycle`'da tüketilmiş işaretlendiğinden
defter "bu turda çaldı" ile "sonraki tur için sırada"yı ayıramıyordu. Kuyruk
sıfırlanınca (resetAutoQueue) liste kendini turun başında sanıp #0'dan
diziliyordu — 15 Ağu 20:14 Mezzanine, sahnede #14 çalarken sıradaki #0.
**How to apply:** kuyruğu silen/yeniden kuran yeni bir yol yazarken sıralamayı
düşünme, kural boğazın içinde. Ama `pickFromRotation` içindeki tarama sırasını
liste sırasına geri çevirme — hata sınıfı orada. `npm test`
(`lib/rotation-order.test.ts`, node --test, ek bağımlılık yok) o gecenin
durumunu birebir kuruyor; testi bozan değişiklik hatayı geri getiriyor demektir.
Karıştırmalı listeler muaf (sıra kavramı yok).

**22 Eyl 2026 — kısa liste döngüsü:** çalan liste varken katalog yedeğinin
tabanı 10 değil 1 (`runFill` içinde `floor`). 3 şarkılık "night" listesi
play'lenince arkasına 8 rastgele katalog şarkısı giriyordu: listenin bütün
şarkıları sahnede/kuyrukta olduğu için yeni şarkı veremiyor, 10'luk taban da
boşluğu katalogdan dolduruyordu. Kısa liste artık yalnızca kendi şarkılarıyla
döner. Commit 8c88617, 22 Eyl prod'da.

**5 Eki 2026 — sıradan "şimdi çal" üstündekileri ATLAR (Spotify):** kuyruk
panelinde bir satırın play tuşuna basınca o satırın üstündeki admin/otomatik
satırlar `status='removed'` olur, seçilenin bir altındaki "sıradaki" olur
(`playSongNowLocked`, yalnız `queueId` yolu; panel `usePlayback.playNow`'da
iyimser aynısını yapar). Müşteri satırları ASLA atlanmaz — yerinde kalır, önce
onlar çalar. Atlanan otomatik satırların tüketimi geri alınmaz: liste onları bu
turda geçmiş sayar. Migration YOK.

**5 Eki 2026 (2) — yeni turda sıra deliği (Biralem, Move):** sıralı liste
taraması kuyruktaki şarkıyı ATLAYIP ilerisinden alıyordu. Kuyruk liste sonuna
kadar dolu olduğu için yeni tur eski turun şarkıları hâlâ kuyruktayken başlıyor;
bir turda eksik kalan şarkı (Move, 30 Eyl'den beri) sonraki turda kendi yerine
değil sıranın çok önüne yazılıp orada tüketiliyor, kendi yerinde (Ara Beni
Lütfen → Move → Yamore) hiç çıkmıyordu — her turda kendini yeniden üretiyordu.
Artık `scanSequential` (lib/rotation-order.ts, testli): aynı listenin otomatik
satırında/sahnede bekleyen şarkıda tarama DURUR; elle/müşteri satırında
bekleyen şarkı bu turda tüketilmiş sayılır (startPlaylistFrom'un baş dolumu da).
Karıştırmalı listeler eski davranışta. Sağlık ekranının "Hatalı sıra"sı bunu
GÖRMEZ: yalnız müşteri isteklerinin sırasını ölçer. Migration YOK.
Aynı gün: rayın "Çalıyor X/N" sayacı başa sarmadan sonra 0'a düşüyordu (kuyruk
sonraki turu da tuttuğu için bekleyen > tüketilen). Sıralı çalan listede sayı
artık çalan şarkının listedeki yerinden (`usePlayback.playingListAnchor` →
`useLibrary.playedByList`); karıştırmalıda eski formül. Sıraya eklenen
listenin bloğundan şarkı çalarken rayda sarı rozetin yanında "Çalıyor 3/114"
(`usePlayback.manualStage` → `useLibrary.manualPlaying`).

**5 Eki 2026 (3) — sıraya eklenen listenin İÇİNDEN çalma:** liste bloğu
kuyruktayken (ya da sahnedeyken) o listeden şarkıya basmak genel "listenin
ortasından çal" yoluna düşüyordu: liste çalan liste oluyor, eski çalan liste
raydan düşüyor, ama elle eklenen blok kuyrukta kaldığından sıra "bloğun kalanı →
listenin otomatik devamı" diye iki kopya halinde karışıyordu (rayda "sırada"
yok, sağda "SIRAYA EKLENEN LİSTE" var). Artık `hasManualBlock` → `playSongNow(
{manualBlock:true})` + `jumpManualBlock`: blok seçilen şarkının devamından
yeniden kurulup şeridin başına alınır, çalan liste ve otomatik bloğu
dokunulmaz. Sahneye çıkan satır admin/kaynak=liste olur.

**Tuzak:** 0037 SQL ŞART ve kod deploy'undan ÖNCE çalıştırılmalı. Backfill
mevcut `is_active` listeleri `sort_order` ile kuyruğa yazdığı için SQL tek
başına davranışı değiştirmez.

Bu, [[pmj-playlist-rotation-2026-08]] modelinin yerini alır (motor aynı, kapı
değişti). İlgili: [[pmj-playlists-2026-08]], [[pmj-playing-cooldown-2026-08]],
[[pmj-admin-home-merge-2026-08]]
