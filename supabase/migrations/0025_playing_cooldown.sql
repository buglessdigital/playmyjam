-- 0025: "Çalan şarkı" kuralı + cooldown'ın başlangıç anına sabitlenmesi.
--
-- Kurallar (müşteri tarafı):
--   1. Şu an çalan şarkı, kaynağı ne olursa olsun (müşteri isteği veya auto-fill)
--      çaldığı sürece sıraya eklenemez.
--   2. Müşteri isteğiyle kuyruğa girmiş bir şarkı, ÇALMAYA BAŞLADIĞI andan
--      itibaren 30 dk boyunca tekrar sıraya eklenemez. (Eskiden sayaç şarkı
--      bitince — played_at — başlıyordu; artık başlangıç anı esas.)
--   3. auto-fill (user_id null) çalan şarkılar için 30 dk sınırı YOKTUR; şarkı
--      bittiği anda tekrar eklenebilir.
--
-- Bunun için kuyruk satırının çalmaya başladığı an gerekiyordu: queue.started_at.
-- Kolon uygulama katmanında (lib/queue.ts, playNextFromQueue) yazılır; eski
-- satırlar için coalesce(started_at, played_at) ile geriye dönük uyumluluk var.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0024'ten SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (kolon nullable ve tüm eklemeler
-- additive olduğu için eski kod bu SQL uygulandıktan sonra da çalışır).

begin;

-- 1) Kuyruk satırının çalmaya başladığı an
alter table public.queue
  add column if not exists started_at timestamptz;

-- Şu an çalan satırlar için çapa: now_playing.started_at (yoksa şimdi).
-- Geçmiş ('played') satırlar boş kalır — sorgular played_at'e düşer.
update public.queue q
   set started_at = coalesce(np.started_at, now())
  from public.now_playing np
 where np.venue_id = q.venue_id
   and q.status = 'playing'
   and q.started_at is null;

-- Cooldown sorgusu her sıraya eklemede çalışıyor
create index if not exists queue_venue_song_status_idx
  on public.queue (venue_id, song_id, status);

-- 2) request_song: 0015 gövdesi + yeni kurallar (çalıyor / zaten sırada / cooldown)
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

  -- Şu an çalıyorsa reddet (auto çalsa bile — sahnedeki şarkı sıraya eklenemez)
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id and status = 'playing'
  ) then
    return jsonb_build_object('ok', false, 'error', 'playing');
  end if;

  -- Müşteri kuyruğunda zaten bekliyorsa reddet (çift jeton harcanmasın)
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

revoke execute on function public.request_song(uuid, uuid, uuid, boolean) from public, anon, authenticated;

-- 3) Gözat sayfası (0022 gövdesi + cooldown çapası ve "çalan şarkı" düzeltmesi)
create or replace function public.get_browse_user_state(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'queued_song_ids', coalesce((
      select jsonb_agg(distinct song_id) from public.queue
      where venue_id = p_venue_id and status = 'queued' and user_id is not null
    ), '[]'::jsonb),
    -- Cooldown listesi: yalnızca müşteri istekleri, çapa = çalmaya başladığı an.
    -- Çalmakta olan müşteri şarkısı da buraya dahil (30 dk onunla başlar).
    'recently_played', coalesce((
      select jsonb_agg(jsonb_build_object(
        'song_id', song_id,
        'played_at', (extract(epoch from coalesce(started_at, played_at)) * 1000)::bigint
      ))
      from public.queue
      where venue_id = p_venue_id and status in ('played', 'playing')
        and user_id is not null
        and coalesce(started_at, played_at) >= now() - interval '30 minutes'
    ), '[]'::jsonb),
    -- Sahnedeki şarkı: auto-fill dahil (çaldığı sürece sıraya eklenemez)
    'playing', (
      select jsonb_build_object(
        'song_id', song_id,
        'started_at', (extract(epoch from coalesce(started_at, added_at, now())) * 1000)::bigint
      )
      from public.queue
      where venue_id = p_venue_id and status = 'playing'
      limit 1
    ),
    -- Misafirde cüzdan yok: tablo hiç okunmaz
    'token_balance', case when auth.uid() is null then 0 else coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0) end,
    'favorite_ids', case when auth.uid() is null then '[]'::jsonb else coalesce((
      select jsonb_agg(song_id) from public.user_favorites where user_id = auth.uid()
    ), '[]'::jsonb) end,
    'queue_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'priority', q.priority, 'duration_ms', coalesce(s.duration_ms, 0)
      ))
      from public.queue q
      left join public.songs s on s.id = q.song_id
      where q.venue_id = p_venue_id and q.status = 'queued' and q.user_id is not null
    ), '[]'::jsonb),
    'now_playing', (
      select jsonb_build_object(
        'song_id', np.song_id,
        'progress_ms', np.progress_ms, 'is_playing', np.is_playing,
        'duration_ms', s.duration_ms
      )
      from public.now_playing np
      join public.songs s on s.id = np.song_id
      where np.venue_id = p_venue_id
      limit 1
    )
  );
$$;

-- 4) Şarkı detay sayfası (0022 gövdesi + cooldown çapası ve playing_song_id)
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
      select vs.in_venue_list from public.venue_songs vs
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

grant execute on function public.get_browse_user_state(uuid) to anon, authenticated;
grant execute on function public.get_song_user_state(uuid, text) to anon, authenticated;

commit;
