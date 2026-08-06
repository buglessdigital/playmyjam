-- 0034: Kuyruk sırası kesinleştirildi.
--
-- Kural (değişmedi, artık garanti altında):
--   1. Öncelikli şarkılar her zaman normal şarkıların üstünde — sonradan
--      eklenmiş olsa bile.
--   2. Öncelikliler KENDİ ARASINDA ekleme sırasıyla: önce eklenen üstte.
--   3. Normaller de kendi arasında ekleme sırasıyla.
--
-- Sorun neydi: request_song (0025) her öncelikli satırı position = 0 ile
-- yazıyor. Sıralama anahtarı (priority desc, position asc) olduğu için tüm
-- öncelikli satırlar TAM BERABERE kalıyordu; PostgreSQL berabere satırlar için
-- sıra garantisi vermez, sırayı plan ve heap'teki fiziksel konum belirler.
-- status/started_at güncellemeleri satırı heap sonuna taşıdığı için sıra
-- zamanla da kayıyordu. Sonuç: sonradan eklenen öncelikli, önce eklenenin
-- önüne geçiyordu. Aynı beraberlik normal satırlarda da oluşabiliyor: pozisyon
-- kilitsiz bir "max + 1" ile hesaplandığı için (0025) aynı anda gelen iki istek
-- aynı pozisyonu alabiliyor.
--
-- Çözüm: sıralama anahtarına added_at (sonra id) eklenerek beraberlik tamamen
-- kaldırıldı. position bandları (müşteri < 9000, otomatik >= 9000) ve adminin
-- sürükle-bırak sıralaması aynen korunur.
--
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (ikisi de tek başına doğru çalışır,
-- yalnızca sıra garantisi gecikir).
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0033'ten SONRA çalıştırın.

begin;

-- 1) added_at artık sıralama anahtarı: boş olamaz.
-- Eski satırlar için en iyi tahmin: çalmaya başladığı an, yoksa çaldığı an.
update public.queue
   set added_at = coalesce(started_at, played_at, now())
 where added_at is null;

alter table public.queue alter column added_at set default now();
alter table public.queue alter column added_at set not null;

-- 2) Kuyruk okuması her sayfa açılışında + her Realtime olayında çalışıyor
create index if not exists queue_venue_status_order_idx
  on public.queue (venue_id, status, priority desc, position asc, added_at asc, id asc);

-- 3) Kuyruk sayfası RPC'si (0006 gövdesi + kesin sıralama anahtarı).
-- İçteki limit 10 de aynı anahtarı kullanmalı: beraberlikte HANGİ 10 satırın
-- seçildiği bile sorgudan sorguya değişebiliyordu.
create or replace function public.get_queue_state(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'now_playing', (
      select jsonb_build_object(
        'song_id', np.song_id,
        'progress_ms', np.progress_ms,
        'is_playing', np.is_playing,
        'started_at', np.started_at,
        'songs', case when s.id is null then null else jsonb_build_object(
          'title', s.title, 'artist', s.artist,
          'album_cover_url', s.album_cover_url, 'duration_ms', s.duration_ms
        ) end
      )
      from public.now_playing np
      left join public.songs s on s.id = np.song_id
      where np.venue_id = p_venue_id
      limit 1
    ),
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'song_id', q.song_id, 'added_by', q.added_by,
        'tokens_spent', q.tokens_spent, 'priority', q.priority,
        'position', q.position, 'added_at', q.added_at,
        'songs', jsonb_build_object(
          'title', s.title, 'artist', s.artist,
          'album_cover_url', s.album_cover_url, 'duration_ms', s.duration_ms
        )
      ) order by q.priority desc, q.position asc, q.added_at asc, q.id asc)
      from (
        select * from public.queue iq
        where iq.venue_id = p_venue_id and iq.status = 'queued'
        order by iq.priority desc, iq.position asc, iq.added_at asc, iq.id asc
        limit 10
      ) q
      join public.songs s on s.id = q.song_id
    ), '[]'::jsonb)
  );
$$;

commit;
