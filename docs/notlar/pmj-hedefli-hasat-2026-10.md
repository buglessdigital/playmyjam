---
name: pmj-hedefli-hasat-2026-10
description: "16 Eki 2026'dan beri elle hasat HEDEFLİ — `--harvest` (Topic çığı) kullanılmaz; ölçüm video kimliğiyle, sanatçı kanalı ülkeye göre seçilir"
metadata:
  type: project
---

**Karar (16 Eki 2026):** elle hasat artık `--harvest` ile ÇALIŞTIRILMAZ. Yalnızca seçilmiş kaynak okunur:
`node scripts/seed-catalog.ts --budget <n> --file <liste>` ya da `--playlist UU…`.

**Why:** `--harvest` havuzda adı geçen HER "Sanatçı - Topic" kanalını okur ve kanal sayısı her turda kendiliğinden büyür (düet → yeni Topic kanalı → sonraki tur). 6-15 Eki turları ~230 bin şarkı getirdi ama içinde Kore baladları ("Aretha Franklin - Topic" yüklemelerine YouTube'un karıştırdığı STONE MUSIC kayıtları), 14 bin şarkılık hedefsiz listeler vardı. Kullanıcının istediği "Türkiye'de mekanda çalınabilecek popüler şarkılar"; hacim değil.

**Asıl boşluk sanatçının KENDİ kanalıydı:** Topic hasadı sanatçının resmi (Topic olmayan) kanalını hiç okumaz. Mela Bedel'in Topic kanalı yok, kendi kanalı kimse eklemediği için okunmamıştı → "Ben Değilim" havuzda yoktu. Ölçüm: havuzdaki 1,26 milyon satırda kanal adı = sanatçı adı olan 3.286 kanalın 2.261'i hiç okunmamıştı. `channels.list` (50 kanal = 1 birim) ile ülkesi TR olan 210 + ülkesiz ama adında Türkçe harf olan 37 kanal seçildi; 900+ videolu derleme/plak/cover kanalları (Anadolu Müzik, Ateş Müzik, Akustikhane…) çıkarıldı → 228 kanal, 13.212 şarkı, 1.112 birim. Liste: `scripts/.tr-sanatci-kanallari-2026-10.txt`.

**How to apply:**
1. **Eksik ölçümü video kimliğiyle yapılır, şarkı adı tahminiyle DEĞİL.** Claude'un ezberden yazdığı "X'in hiti Y" listesi güvenilmez çıktı (Kenan Doğulu "Tutumlu Ol", Yalın "Ah Be Kızım" gibi var olmayan şarkılar). Kullanıcıdan YouTube Music liste linkleri alınır, `playlistItems` ile kimlikler çekilir, `songs.youtube_video_id` ile karşılaştırılır. Kimlikle eksik görünen şarkı başka bir videoyla havuzda olabilir (klip ↔ Topic sesi) — "gerçekten eksik" demeden önce ad+sanatçıyla da bakılır.
2. **YouTube Music'in kendi listeleri (`RDCLAK5uy_…`) sayfalamada döngüye girer:** ilk sayfadan sonra aynı `nextPageToken` gelir. Bu listeler `seed-catalog.ts`'e VERİLMEZ (betikte döngü koruması yok, `MAX_PER_PLAYLIST` 25.000'e kadar kota yakar). Yalnızca ilk ~50 şarkı görülebilir; eksikler video kimliğiyle doğrudan eklenir (`videos.list` 50 video = 1 birim → `toCatalogRow` → `songs` upsert).
3. Kullanıcının seçtiği listelerde `categoryId ≠ 10` olan gerçek şarkılar çıkar (Kişiler ve Bloglar/Eğlence kategorisinde yüklenmiş klipler: Özdemir Erdoğan, Karaf, Melis Fis…). Seçilmiş listede kategori kuralı atlanabilir; toplu hasatta ATLANMAZ.
4. Kanalı havuzda hiç geçmeyen sanatçı (Berkay, Ersay Üner, Mavi Gri…) kanal taramasıyla bulunamaz — kullanıcıdan şarkı linki istenir, `videos.list` ile `channelId` bulunur, o kanal okunur.
5. 1theK (Kore) ve T-Series (Hint) `seed-playlists.txt`'ten çıkarıldı; büyük oldukları için hep bütçe dışında kalıyorlardı, okunsalar ~50 bin alakasız şarkı.

Bkz. [[pmj-katalog-hasadi-2026-09]], [[pmj-katalog-talep-yonlu-2026-09]].
