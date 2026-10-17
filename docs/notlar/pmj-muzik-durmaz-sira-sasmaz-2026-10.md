---
name: pmj-muzik-durmaz-sira-sasmaz-2026-10
description: "17 Eki 2026 olayı + projenin değişmez kuralları: kod şarkı SİLMEZ (Şimdi güncelle dahil), damga yalnız YouTube API doğrularsa, panel komutu kaybolmaz, son tıklama kazanır, sıradaki otomatik satır yalnız çalan listeden, okuma hatasında dolum durur, ağ hatası kuyruk-boş sayılmaz; migration yok"
metadata:
  type: project
---

**Kullanıcının kırmızı çizgisi:** müzik durmayacak, sıra mekan sahibinin belirlediğinden şaşmayacak. Aşağıdaki kurallar buna hizmet eder; birini gevşeten değişiklik bu notu okumadan yapılmaz.

**Olay (17 Eki 2026, The Mezzanine Bar):** üç bağımsız arıza, hiçbiri Sorunlar ekranına düşmedi.
1. Önyükleme deck'i (sessiz ikinci deck) dakikalar önce sonuna kadar çalmış şarkılara YouTube hata 150 verdi; eski kod tek hatayla şarkıyı `embeddable=false` yapıp `purgeUnplayableSong` ile BÜTÜN mekanların listelerinden siliyordu. İşaretten sonra anında yeniden önyükleme → bozuk deck sıradakini de düşürüyordu (her patlamada 5 şarkı). "akşam üstü türkçe" 18→3 şarkıya indi. Sistem genelinde 101 damganın 70'i yanlıştı (Biralem HİP/POP'tan art arda 25 şarkı). Kayıttaki `video_id` çalan şarkıydı, hata veren değil — o yüzden fark edilmedi.
2. `runSingleFlight` kilit doluyken işi ATIYORDU (dirty yalnız dolumu tekrarlar). Başka listeden "şarkıdan çal" → sahne değişti ama liste devri düştü → şarkı bitince eski listeden çaldı.
3. Kuyruk boşken ilerletmenin yaptığı `fillQueue` de aynı yoldan düşüyordu → "kuyruk boşaldı, müzik durdu".

**Değişmez kurallar (kod):**
- **K1 Kod şarkı silmez.** `purgeUnplayableSong` KALDIRILDI. Damga yalnız çalmadan (dolum zaten `songs.embeddable` süzer) ve satıştan (müşteri katalogları `songs!inner` + `.eq("songs.embeddable", true)`, `/api/queue` 409 `unplayable`) çıkarır; şarkı mekanın listesinde "YouTube'da kapalı" rozetiyle durur. YouTube açarsa 30 günlük metadata tazelemesi `embeddable`'ı geri true yapar. Kullanıcı: "geri gelebiliyorsa silinmesi bizim hatamızdır" — geri kurulum mekanizması önerme, silme.
- **K2 Damga yalnız YouTube Data API kararıyla** (`lib/playability.ts`, `checkVideoPlayable`, 1 birim; TR bölge engeli dahil). Player hatası yalnız tetikleyicidir: aktif deck'te şarkı hemen atlanır, karar arkadan; önyüklemede video ilk hatada elenmez, 10 sn sonra bir kez daha denenir. API'ye ulaşılamazsa ("unknown") damga YOK. Her karar Sorunlar'a (`song_unplayable` / `youtube_error_unconfirmed` / `youtube_error_unverified`).
- **K3 Panel komutu kaybolmaz.** `withFillLock` ve `resetAutoQueue` artık `runSingleFlightWaiting`: kilit doluysa bekler (kira 60 sn + 5), işi tek kez koşar, kilitteyken gelen dolum isteklerini düz dolumla karşılar (komutu tekrarlamaz). Boş kuyruk dolumu `fillQueueNow` (8 sn bekler, sonra kilitsiz). Yanıttan sonraki iş patlarsa `reportQueueWorkFailure` (eskiden `.catch(() => {})` yutuyordu).
- **K4 Son tıklama kazanır.** `playSongNow(..., {deferQueueWork})` sahne kilidi içinde `markLatestIntent` damgası atar (`queue_fill_locks` satırı, `scope='intent'` — tablo/migration yok). Ertelenen liste devri `isLatestIntent` değilse uygulanmaz.
- **K5 Sıradaki otomatik satır yalnız çalan listeden** (`queue_position` dolu). Her geçişte `advanceToNext` denetler (`lib/queue-invariants.ts`); ihlalde o listenin bekleyen otomatik satırları düşer, sıra çalan listeden yeniden kurulur, Sorunlar `order_repaired` + e-posta.
- **Alarm:** `alertOrderProblem` (lib/music-alert.ts) — `order_repaired`, `command_failed`, `queue_empty` OPS_ALERT_EMAIL'e (mekan+tür başına 30 dk). `queue_empty` artık Sorunlar'da da.

**Sağlamlaştırma 1 (18 Eki 2026):**
- **K6 "Şimdi güncelle" SİLMEZ.** YouTube'dan çıkarılmış ama listede duran şarkılar yanıtta `gone` döner; panel sarı kutuda "Listeden kaldır / Kalsın" diye sorar (`removeGoneSongs`, YouTube'da gerçekten yok mu yeniden doğrular). Okuma eksikse (500 tavanı, şarkı sayısı varken boş yanıt) "çıkarılmış" kararı hiç verilmez, snapshot'tan bir şey düşmez (`lib/playlist-sync-diff.ts`). Eskiden 500'ü aşan listede 500'ün ötesi siliniyordu.
- **K7 Okuma hatası = dur.** Dolum (`runFill`, `pickFromRotation`), liste devri (`startPlaylistFrom`: okuma artık yazmalardan ÖNCE), `jumpManualBlock`, `clearAutoQueue` hata/yarım okumada `QueueReadError` fırlatıp hiçbir şey yazmaz. `fetchAllRows` hata alınca yarım veri döndürür — hatasını kontrol etmeden kullanma. Boş kuyrukta ilerletme dolumu 3 kez dener.
- **K8 Sunucuya ulaşılamaması "kuyruk boş" değildir.** Player geçiş cevapsız kalınca sessizlik ekranına düşmez, 3/5/10/15 sn aralıkla aynı geçişi yeniden dener (sahne bu arada değiştiyse vazgeçer). Gerçek "kuyruk boş"ta 8 sn'lik boşta yoklama zaten vardı (`reason: "idle-retry"`, kayıt basmaz); sunucunun `queue_empty` kaydı mekan başına 10 dk'da bir.
- `markLatestIntent` yazamazsa undefined döner, komut koşulsuz uygulanır (önceki sürüm devri atlıyordu).

**Sağlamlaştırma 2 (18 Eki 2026):**
- "Şimdi çal" ve play tuşu sahne kilidine (503) takılınca sunucu 8×400 ms kendisi yeniden dener (`playSongNowPatient`), panel de 6×600 ms. Ağ hatasında panel player'ı `now_playing`'deki gerçek şarkıya hizalar.
- Çalan deck'te 100/101/150: atlamadan önce aynı video BİR kez yeniden yüklenir.
- **Yedek 5 şarkı:** `peek` artık `video_ids` (sıradaki 5 çalınabilir) döner; player `backupIdsRef`'te tutar, her başarılı yoklamada (kuyruk her değiştiğinde) tazeler, kesintide DOKUNMAZ. Sunucuya ulaşılamazken sırayla çalar (`lib/offline-backup.ts`); bağlantı dönünce `sync` `played_video_ids` ile yedekten çalınıp bitenleri kapatır (yoksa tekrar çalarlardı). Sırayı yine sunucu belirler; müşteri eklemesi kesinti bitince sıradaki olur. İnternet tamamen kesikse YouTube da yok — yedek yalnız BİZİM sunucumuz yokken işe yarar.
- Sekme donması kodla çözülemez: panel SSS'sinde Chrome Bellek/Enerji Tasarrufu + uyku ayarları rehberi.

**Testler:** `lib/lock-wait.test.ts`, `lib/playability.test.ts`, `lib/queue-invariants.test.ts` o günün durumlarını kurar.

**Veri onarımı (17 Eki):** 101 damga YouTube'a soruldu, 70'i kaldırıldı; `playlist_sources.snapshot_video_ids` sırasından 84 liste üyeliği orijinal pozisyonuyla geri kuruldu. Snapshot'ı olmayan (elle eklenmiş) üyelikler ve silinen `venue_songs.play_count` geri gelmedi.

Bkz. [[pmj-unplayable-damga-2026-08]] (yerini aldı), [[pmj-playlist-queue-2026-08]], [[pmj-fillqueue-yaris-2026-08]], [[pmj-muzik-durdu-alarmi-2026-10]], [[pmj-sorunlar-ekrani-2026-09]].
