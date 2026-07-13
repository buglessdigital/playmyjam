-- Mekanlar arası hesap: global jeton cüzdanı + "Son Çaldırılanlar" geçmişi.
-- Jeton bakiyesi mekan bazlı user_tokens'tan tek global user_wallets'a taşınır
-- (mevcut bakiyeler kullanıcı başına TOPLANIR). Eski 3-parametreli fonksiyon
-- imzaları geçiş sarmalayıcısı olarak kalır — kod deploy'u tamamlanınca 0011
-- ile kaldırılır.
-- Uygulama: Supabase Dashboard > SQL Editor'da 0009'dan SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u.

begin;

-- 1) Global cüzdan: PK tek-satır-tek-kullanıcı garantisi verir
create table if not exists public.user_wallets (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  balance    int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_wallets enable row level security;

-- Kullanıcı yalnızca kendi bakiyesini görür; yazma yok (RPC/service-role)
drop policy if exists "user_wallets_own_read" on public.user_wallets;
create policy "user_wallets_own_read" on public.user_wallets
  for select to authenticated using (auth.uid() = user_id);

-- 2) Veri taşıma: mekan bazlı bakiyeleri topla, global cüzdana aktar.
--    user_tokens geçiş penceresi boyunca boş kalır (0011'de düşürülecek).
insert into public.user_wallets (user_id, balance)
select user_id, sum(balance)
  from public.user_tokens
 group by user_id
on conflict (user_id) do update set balance = excluded.balance;

delete from public.user_tokens;

-- 3) Yeni 2-parametreli fonksiyonlar (venue parametresi yok).
--    Koşullu UPDATE atomik olduğundan eşzamanlı isteklerde çift harcama olamaz.
create or replace function public.spend_tokens(p_user_id uuid, p_amount int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_amount <= 0 then
    return false;
  end if;

  update public.user_wallets
     set balance = balance - p_amount,
         updated_at = now()
   where user_id = p_user_id
     and balance >= p_amount;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end
$$;

create or replace function public.add_tokens(p_user_id uuid, p_amount int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then
    raise exception 'add_tokens: miktar pozitif olmalı';
  end if;

  insert into public.user_wallets (user_id, balance)
       values (p_user_id, p_amount)
  on conflict (user_id)
       do update set balance = public.user_wallets.balance + excluded.balance,
                     updated_at = now()
  returning balance into v_balance;

  return v_balance;
end
$$;

revoke execute on function public.spend_tokens(uuid, int) from public, anon, authenticated;
revoke execute on function public.add_tokens(uuid, int) from public, anon, authenticated;

-- 4) GEÇİŞ SARMALAYICILARI: eski 3-parametreli imzalar venue'yu yok sayıp
--    global cüzdana delege eder; eski deploy'daki kod kesintisiz çalışır.
create or replace function public.spend_tokens(p_user_id uuid, p_venue_id uuid, p_amount int)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.spend_tokens(p_user_id, p_amount);
$$;

create or replace function public.add_tokens(p_user_id uuid, p_venue_id uuid, p_amount int)
returns int
language sql
security definer
set search_path = public
as $$
  select public.add_tokens(p_user_id, p_amount);
$$;

revoke execute on function public.spend_tokens(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.add_tokens(uuid, uuid, int) from public, anon, authenticated;

-- 5) request_song: jeton düşümü artık global cüzdandan (0005 gövdesi,
--    yalnızca spend_tokens çağrısı 2-parametreli sürüme geçti)
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
  v_cost int := case when p_priority then 2 else 1 end;
  v_position int;
  v_username text;
begin
  -- Son 30 dk içinde çalındıysa reddet
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id
       and status = 'played' and user_id is not null
       and played_at >= now() - interval '30 minutes'
  ) then
    return jsonb_build_object('ok', false, 'error', 'cooldown');
  end if;

  -- Şu an çalıyorsa reddet
  if exists (
    select 1 from public.queue
     where venue_id = p_venue_id and song_id = p_song_id and status = 'playing'
  ) then
    return jsonb_build_object('ok', false, 'error', 'playing');
  end if;

  -- Atomik jeton düşümü: global cüzdandan
  if not public.spend_tokens(p_user_id, v_cost) then
    return jsonb_build_object('ok', false, 'error', 'insufficient_tokens');
  end if;

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

-- 6) token_balance okuyan state RPC'leri user_wallets'a geçer.
--    İmzalar aynı → client değişikliği gerekmez. get_queue_state jeton
--    okumadığından dokunulmadı.

-- 6a) Gözat sayfası (0006 gövdesi, yalnızca token_balance değişti)
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
    'recently_played', coalesce((
      select jsonb_agg(jsonb_build_object(
        'song_id', song_id,
        'played_at', (extract(epoch from played_at) * 1000)::bigint
      ))
      from public.queue
      where venue_id = p_venue_id and status = 'played' and user_id is not null
        and played_at >= now() - interval '30 minutes'
    ), '[]'::jsonb),
    'playing', (
      select jsonb_build_object(
        'song_id', song_id,
        'started_at', (extract(epoch from coalesce(added_at, now())) * 1000)::bigint
      )
      from public.queue
      where venue_id = p_venue_id and status = 'playing' and user_id is not null
      limit 1
    ),
    'token_balance', coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0),
    'favorite_ids', coalesce((
      select jsonb_agg(song_id) from public.user_favorites where user_id = auth.uid()
    ), '[]'::jsonb),
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

-- 6b) Şarkı detay sayfası (0008 gövdesi — YouTube sürümü, yalnızca token_balance değişti)
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
    'is_favorite', exists(
      select 1 from public.user_favorites f
      where f.user_id = auth.uid() and f.song_id = (select id from song)
    ),
    'token_balance', coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0),
    'recently_played_at', (
      select (extract(epoch from max(played_at)) * 1000)::bigint
      from public.queue
      where venue_id = p_venue_id and song_id = (select id from song)
        and status = 'played' and user_id is not null
        and played_at >= now() - interval '30 minutes'
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

-- 6c) Profil sayfası (0006 gövdesi, yalnızca token_balance değişti)
create or replace function public.get_profile_state(p_venue_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'username', (select username from public.profiles where id = auth.uid()),
    'token_balance', coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0),
    'fav_count', (select count(*) from public.user_favorites where user_id = auth.uid()),
    'request_count', (select count(*) from public.queue where user_id = auth.uid())
  );
$$;

revoke execute on function public.get_browse_user_state(uuid) from public, anon;
revoke execute on function public.get_song_user_state(uuid, text) from public, anon;
revoke execute on function public.get_profile_state(uuid) from public, anon;
grant execute on function public.get_browse_user_state(uuid) to authenticated;
grant execute on function public.get_song_user_state(uuid, text) to authenticated;
grant execute on function public.get_profile_state(uuid) to authenticated;

-- 7) Mekanlar arası "Son Çaldırılanlar": kullanıcının tüm mekanlarda çaldırdığı
--    şarkılar, mekan adıyla. security invoker yeterli — queue herkese-SELECT
--    (0002 queue_public_read), songs herkese-SELECT, venues kolon bazlı grant'lı;
--    filtre auth.uid() ile yalnızca kendi satırları.
create or replace function public.get_played_history()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'song_id', q.song_id,
    'title', s.title,
    'artist', s.artist,
    'album_cover_url', s.album_cover_url,
    'venue_name', v.name,
    'venue_slug', v.slug,
    'played_at', (extract(epoch from q.played_at) * 1000)::bigint
  ) order by q.played_at desc nulls last), '[]'::jsonb)
  from (
    select id, song_id, venue_id, played_at
      from public.queue
     where user_id = auth.uid()
       and status = 'played'
     order by played_at desc nulls last
     limit 50
  ) q
  join public.songs  s on s.id = q.song_id
  join public.venues v on v.id = q.venue_id;
$$;

revoke execute on function public.get_played_history() from public, anon;
grant execute on function public.get_played_history() to authenticated;

commit;
