-- 0040: Playlist'lerde müşteri aktifliği — müşteri yalnızca AKTİF listelerdeki
-- şarkıları görebilir/çaldırabilir.
--
-- Bugüne kadar müşteri katalogu mekanın TÜM şarkılarıydı (venue_songs = tüm
-- listelerin birleşimi, bkz. 0026 kural 2). Mekan "bu liste yalnızca fon müziği,
-- müşteri buradan seçmesin" diyemiyordu.
--
-- Yeni kural — tek yönlü bir kapı:
--   * playlists.customer_visible = true  → listedeki şarkılar müşteri panelinde
--     görünür ve jetonla sıraya eklenebilir. VARSAYILAN: true (mevcut mekanlar ve
--     yeni açılan listeler bugünkü davranışta kalır).
--   * customer_visible = false → şarkılar müşteride hiç görünmez, /api/queue
--     üzerinden de eklenemez. AMA otomatik çalma (playlist kuyruğu, rotasyon,
--     katalog yedeği) bundan HİÇ etkilenmez — pasif liste yine sırayla çalar.
--   * Bir şarkı birden çok listede olabilir: TEK BİR aktif listede bulunması
--     müşteriye açılması için yeter.
--
-- Neden materyalize kolon (venue_songs.playlist_visible)?
--   Müşteri tarafı katalogu tek tabloda okuyor (kabuk cache + client realtime,
--   bkz. lib/venue-cache.ts ve BrowseClient). Her okumada playlist_songs join'i
--   yapmak yerine sonuç venue_songs'a yazılıyor:
--     - müşteri sorgusu tek tablo olarak kalıyor (hız),
--     - liste pasife alınınca venue_songs satırları değiştiği için müşteri
--       panellerine realtime bildirim kendiliğinden gidiyor (anında yansıma).
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0039'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u. SQL tek başına davranışı
-- DEĞİŞTİRMEZ (her şey varsayılan olarak aktif gelir).

begin;

-- 1) Listenin müşteriye açıklığı. Varsayılan true: mevcut tüm listeler aktif.
alter table public.playlists
  add column if not exists customer_visible boolean not null default true;

-- 2) Şarkının müşteriye açıklığı: "en az bir aktif listede üye mi" sorusunun
--    materyalize edilmiş cevabı. in_venue_list'ten AYRI: o adminin tek tek
--    şarkıyı gizlemesi, bu listenin tamamının kapatılması. Müşteri tarafı ikisinin
--    VE'sini okur.
alter table public.venue_songs
  add column if not exists playlist_visible boolean not null default true;

-- 3) Verilen şarkıların bayrağını yeniden hesaplar. Tek giriş noktası: aşağıdaki
--    üç trigger da buraya düşer.
create or replace function public.refresh_playlist_visibility(p_venue_id uuid, p_song_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.venue_songs vs
     set playlist_visible = exists (
           select 1
             from public.playlist_songs ps
             join public.playlists p on p.id = ps.playlist_id
            where ps.venue_id = vs.venue_id
              and ps.song_id = vs.song_id
              and p.customer_visible
         )
   where vs.venue_id = p_venue_id
     and vs.song_id = any(p_song_ids)
     and vs.playlist_visible is distinct from exists (
           select 1
             from public.playlist_songs ps
             join public.playlists p on p.id = ps.playlist_id
            where ps.venue_id = vs.venue_id
              and ps.song_id = vs.song_id
              and p.customer_visible
         );
$$;

-- 4) Üyelik değişti (şarkı listeye eklendi / listeden çıkarıldı, playlist silinip
--    cascade geldi): yalnızca o şarkı yeniden hesaplanır.
create or replace function public.playlist_songs_sync_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_playlist_visibility(old.venue_id, array[old.song_id]);
    return old;
  end if;
  perform public.refresh_playlist_visibility(new.venue_id, array[new.song_id]);
  return new;
end
$$;

-- Silmede prune trigger'ı (0026) satırı tamamen kaldırmış olabilir; o zaman
-- buradaki update hiçbir satır bulmaz — iki trigger birbirini bozmaz.
drop trigger if exists playlist_songs_sync_visibility on public.playlist_songs;
create trigger playlist_songs_sync_visibility
  after insert or delete on public.playlist_songs
  for each row execute function public.playlist_songs_sync_visibility();

-- 5) Liste aktif/pasif yapıldı: o listedeki tüm şarkılar yeniden hesaplanır.
--    Başka aktif listede de olan şarkı açık kalır (fonksiyon bunu görür).
create or replace function public.playlists_sync_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_playlist_visibility(
    new.venue_id,
    coalesce(array(select ps.song_id from public.playlist_songs ps where ps.playlist_id = new.id), '{}'::uuid[])
  );
  return new;
end
$$;

drop trigger if exists playlists_sync_visibility on public.playlists;
create trigger playlists_sync_visibility
  after update of customer_visible on public.playlists
  for each row when (old.customer_visible is distinct from new.customer_visible)
  execute function public.playlists_sync_visibility();

-- 6) Backfill: kolon varsayılanı true olduğu için mevcut satırlar zaten doğru;
--    yine de hesabı bir kez gerçek üyelikler üzerinden yürüterek garanti altına
--    alırız (ör. bu SQL ikinci kez çalıştırılırsa).
update public.venue_songs vs
   set playlist_visible = exists (
         select 1
           from public.playlist_songs ps
           join public.playlists p on p.id = ps.playlist_id
          where ps.venue_id = vs.venue_id
            and ps.song_id = vs.song_id
            and p.customer_visible
       )
 where true;

-- 6b) Müşteri panelleri venue_songs'u realtime dinliyor (BrowseClient): liste
--     pasife alınınca satırlar değiştiği için açık ekranlar anında tazelenir.
--     Tablo yayında değilse eklenir; zaten ekliyse dokunulmaz.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venue_songs'
    ) then
      alter publication supabase_realtime add table public.venue_songs;
    end if;
  end if;
end
$$;

-- 7) Şarkı detay sayfasının RPC'si (0025 gövdesi) — 'in_venue_list' artık iki
--    bayrağın VE'si: müşteri açısından "eklenebilir mi" sorusunun cevabı budur.
create or replace function public.get_song_user_state(p_venue_id uuid, p_video_id text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with song as (
    select id from public.songs where youtube_video_id = p_video_id limit 1
  )
  select jsonb_build_object(
    'db_song_id', (select id from song),
    'play_count', coalesce((
      select vs.play_count from public.venue_songs vs
      where vs.venue_id = p_venue_id and vs.song_id = (select id from song)
    ), 0),
    'in_venue_list', coalesce((
      select vs.in_venue_list and vs.playlist_visible from public.venue_songs vs
      where vs.venue_id = p_venue_id and vs.song_id = (select id from song)
    ), false),
    'is_favorite', case when auth.uid() is null then false else exists(
      select 1 from public.user_favorites f
      where f.user_id = auth.uid() and f.song_id = (select id from song)
    ) end,
    'token_balance', case when auth.uid() is null then 0 else coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0) end,
    -- Çapa artık çalmaya başlama anı; çalmakta olan müşteri şarkısı da dahil
    'recently_played_at', (
      select (extract(epoch from max(coalesce(started_at, played_at))) * 1000)::bigint
      from public.queue
      where venue_id = p_venue_id and song_id = (select id from song)
        and status in ('played', 'playing') and user_id is not null
        and coalesce(started_at, played_at) >= now() - interval '30 minutes'
    ),
    -- Sahnedeki şarkı (auto dahil): request_song'daki 'playing' kuralının aynası
    'playing_song_id', (
      select song_id from public.queue
      where venue_id = p_venue_id and status = 'playing'
      limit 1
    ),
    'queue_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'song_id', q.song_id, 'priority', q.priority,
        'duration_ms', coalesce(s.duration_ms, 0)
      ))
      from public.queue q
      left join public.songs s on s.id = q.song_id
      where q.venue_id = p_venue_id and q.status = 'queued' and q.user_id is not null
    ), '[]'::jsonb),
    'now_playing', (
      select jsonb_build_object(
        'song_id', np.song_id, 'progress_ms', np.progress_ms,
        'is_playing', np.is_playing, 'duration_ms', coalesce(s.duration_ms, 0)
      )
      from public.now_playing np
      left join public.songs s on s.id = np.song_id
      where np.venue_id = p_venue_id
      limit 1
    )
  );
$$;

grant execute on function public.get_song_user_state(uuid, text) to anon, authenticated;

-- 8) Sunucu tarafı kapı: pasif listedeki (ya da gizlenmiş) şarkı jetonla sıraya
--    eklenemez. Bugüne kadar bu kontrol yalnızca arayüzdeydi; doğrudan API'ye
--    istek atarak aşılabiliyordu. 0035 gövdesinin aynısı + tek yeni blok.
create or replace function public.request_song(
  p_user_id uuid,
  p_venue_id uuid,
  p_song_id uuid,
  p_priority boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_cost int;
  v_priority_cost int;
  v_cost int;
  v_position int;
  v_username text;
  v_balance int;
begin
  select request_cost, priority_cost into v_request_cost, v_priority_cost
    from public.venues where id = p_venue_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;
  v_cost := case when p_priority then coalesce(v_priority_cost, 2)
                 else coalesce(v_request_cost, 1) end;

  -- Müşteriye kapalı şarkı: ya admin tek tek gizlemiş (in_venue_list), ya da
  -- şarkının bulunduğu listelerin hepsi müşteriye pasif (playlist_visible).
  -- Otomatik çalmayı etkilemez — bu kural yalnızca müşteri isteği içindir.
  if not exists (
    select 1 from public.venue_songs vs
     where vs.venue_id = p_venue_id and vs.song_id = p_song_id
       and vs.in_venue_list and vs.playlist_visible
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_available');
  end if;

  -- Şu an çalıyorsa reddet (auto çalsa bile — sahnedeki şarkı sıraya eklenemez)
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id and status = 'playing'
  ) then
    return jsonb_build_object('ok', false, 'error', 'playing');
  end if;

  -- Müşteri kuyruğunda zaten bekliyorsa reddet (çift jeton harcanmasın).
  -- Otomatik satır burada engel DEĞİL: aşağıda müşteri satırına devredilir.
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id
       and status = 'queued' and user_id is not null
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_queued');
  end if;

  -- Müşteri isteğiyle çalan/çalmış şarkı: BAŞLANGIÇ anından itibaren 30 dk kilitli.
  -- auto-fill çalmaları (user_id null) bu kurala girmez.
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id
       and user_id is not null
       and status in ('played', 'playing')
       and coalesce(started_at, played_at) >= now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', false, 'error', 'cooldown');
  end if;

  -- Atomik jeton düşümü: global cüzdandan
  if not public.spend_tokens(p_user_id, v_cost) then
    return jsonb_build_object('ok', false, 'error', 'insufficient_tokens');
  end if;

  select balance into v_balance from public.user_wallets where user_id = p_user_id;
  insert into public.wallet_transactions (user_id, venue_id, song_id, amount, kind, balance_after)
  values (p_user_id, p_venue_id, p_song_id, -v_cost, 'spend', coalesce(v_balance, 0));

  -- Aynı şarkının otomatik satırı varsa kuyruktan düşer: şarkı bundan sonra
  -- müşterinin satırıyla temsil edilir, art arda iki kez çalmaz.
  update public.queue
     set status = 'removed'
   where venue_id = p_venue_id and song_id = p_song_id
     and status = 'queued' and user_id is null and added_by = 'auto';

  -- Müşteri şarkıları arasında en son pozisyon — auto-fill aralığı (>=9000) hariç
  select coalesce(max(q.position), 0) + 1 into v_position
    from public.queue q
   where q.venue_id = p_venue_id and q.status = 'queued'
     and q.user_id is not null and q.position < 9000;

  select username into v_username from public.profiles where id = p_user_id;

  insert into public.queue (venue_id, song_id, user_id, added_by, tokens_spent, priority, position, status)
  values (
    p_venue_id, p_song_id, p_user_id,
    coalesce(v_username, 'Misafir'),
    v_cost, p_priority,
    case when p_priority then 0 else v_position end,
    'queued'
  );

  return jsonb_build_object('ok', true);
end
$$;

commit;
