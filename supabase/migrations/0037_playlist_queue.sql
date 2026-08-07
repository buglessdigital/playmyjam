-- 0037: Playlist kuyruğu — "aktif liste" yerine sıraya alınmış listeler + play tuşu.
--
-- 0032'de listeler is_active bayrağıyla sonsuz bir rotasyonda dönüyordu: hangi
-- listenin ne zaman çalacağına yalnızca sort_order karar veriyordu, mekan
-- "şimdi şu liste çalsın" diyemiyordu. Tek çare listeyi en üste taşıyıp
-- diğerlerini pasife almaktı.
--
-- Yeni model — kuyruk DÖNGÜSEL kalır, sadece imleç elle taşınabilir hale gelir:
--   * queue_position dolu listeler "playlist kuyruğu"dur, bu sırayla tüketilir.
--   * Son liste bitince kuyruk başa döner (cycle +1) — 0032'nin sonsuz döngüsü
--     aynen yaşar, listeler tüketilip kaybolmaz.
--   * Paneldeki play tuşu rotasyon imlecini (playlist_rotation.playlist_id) o
--     listeye atlatır: sırayı beklemeden o liste çalmaya başlar, kuyruktaki
--     sırası değişmez, kendisinden sonrakiler yine arkasından gelir.
--   * play_once işaretli liste bir tam turunu bitirince kuyruktan düşer
--     ("bu gece açılışta bir kez çalsın" senaryosu). Varsayılan kapalı.
--   * Kuyruk boşsa (ya da kuyruktakilerde şu an çalınabilir şarkı kalmadıysa)
--     tüm katalogdan karışık çalınır — müzik hiçbir koşulda susmaz.
--
-- is_active kolonu SİLİNMEZ ama artık okunmaz: yeni kaynak queue_position'dır
-- (null = sırada değil). Kolonu bırakmak, kod deploy'u geri alınırsa eski
-- davranışın olduğu gibi geri gelmesini sağlar.
--
-- Backfill sayesinde bu SQL tek başına HİÇBİR ŞEYİ DEĞİŞTİRMEZ: bugün aktif olan
-- listeler sort_order sırasıyla kuyruğa yazılır, yani yeni kod deploy edildiğinde
-- mekan aynı sırayla çalmaya devam eder.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0036'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u.

begin;

-- 1) Playlist kuyruğundaki yer. null = sırada değil (eski "pasif").
--    Benzersizlik ZORLANMAZ: sıra değiştirme tüm satırları yeniden numaralarken
--    ara adımlarda geçici çakışma olabilir; okuma tarafı (queue_position, id)
--    ile deterministik sıralar.
alter table public.playlists
  add column if not exists queue_position int;

-- 2) Bir turunu bitirince kuyruktan düşen liste
alter table public.playlists
  add column if not exists play_once boolean not null default false;

-- 3) Backfill: bugün aktif olan listeler mevcut çalma sırasıyla kuyruğa girer.
--    Yalnızca hiç kuyruk kurulmamış mekanlarda çalışır (tekrar çalıştırmaya karşı
--    güvenli), o yüzden koşul venue bazında değerlendirilir.
with ranked as (
  select p.id,
         row_number() over (partition by p.venue_id order by p.sort_order, p.created_at) as rn
    from public.playlists p
   where p.is_active
     and not exists (
       select 1 from public.playlists q
        where q.venue_id = p.venue_id and q.queue_position is not null
     )
)
update public.playlists p
   set queue_position = ranked.rn
  from ranked
 where ranked.id = p.id;

-- Kuyruk okuması her dolumda yapılır — indeks küçük ama sıcak
create index if not exists playlists_queue_idx
  on public.playlists (venue_id, queue_position)
  where queue_position is not null;

commit;
