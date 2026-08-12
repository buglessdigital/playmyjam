-- 0045: Talep onay akışı — müşteri talebi → mekan onayı → tek seferlik çalma hakkı.
--
-- Bugüne kadar müşteri önerisi (song_id boş song_requests satırı) ancak mekan
-- şarkıyı kendi YouTube listesine ekleyip panelden içe aktarınca kapanıyordu:
-- elle iş, saatler süren gecikme.
--
-- Yeni akış:
--   1. Müşteri şarkı adı + sanatçı yazıp talep gönderir. Talebin ömrü 10 dakika
--      (song_requests.expires_at) — mekan bu sürede karar vermezse talep 'expired'.
--   2. Mekan admini panelden VEYA doğrudan push bildirimi üzerinden onaylar.
--      Onayda şarkı YouTube'da aranıp ilk sonuç kataloğa girmeden, TEK SEFERLİK
--      çalma hakkı olarak açılır (one_time_songs).
--   3. Müşteriye push gider; hakkın ömrü yine 10 dakika (play_deadline).
--      Bu sürede jetonla sıraya eklenirse hak tükenir (consumed_at), eklenmezse
--      kendiliğinden düşer. Her iki halde de şarkı mekanın kalıcı kataloğuna
--      GİRMEZ: venue_songs/playlist_songs'a hiç dokunulmaz, otomatik çalma
--      havuzu etkilenmez.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0044'ten SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u. SQL tek başına davranışı
-- değiştirmez (yeni tablo boş, yeni kolonlar null, RPC eski yolu aynen korur).

begin;

-- 1) Talep ömrü ve onay penceresi
alter table public.song_requests
  add column if not exists expires_at    timestamptz,  -- mekanın karar süresi
  add column if not exists approved_at   timestamptz,
  add column if not exists play_deadline timestamptz;  -- müşterinin çaldırma süresi

-- Süresi geçmiş bekleyen talepleri tarayan sorgunun indeksi
create index if not exists song_requests_pending_expiry_idx
  on public.song_requests (expires_at)
  where status = 'pending';

-- 2) Tek seferlik çalma hakkı.
--    Katalog satırı DEĞİL: müşteri paneli bunları katalogun üstüne bindirir,
--    otomatik doldurma (playlist rotasyonu) buraya hiç bakmaz.
create table if not exists public.one_time_songs (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues (id) on delete cascade,
  song_id     uuid not null references public.songs (id) on delete cascade,
  request_id  uuid references public.song_requests (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null
);

-- Aynı şarkı için mekanda aynı anda tek açık hak olsun (ikinci onay çakışmasın)
create unique index if not exists one_time_songs_open_key
  on public.one_time_songs (venue_id, song_id)
  where consumed_at is null;

create index if not exists one_time_songs_active_idx
  on public.one_time_songs (venue_id, expires_at)
  where consumed_at is null;

-- Okuma herkese açık (müşteri paneli anon anahtarla okuyor + realtime),
-- yazma yalnızca service-role / RPC — venue_songs ile aynı güven modeli.
alter table public.one_time_songs enable row level security;

drop policy if exists "one_time_songs_public_read" on public.one_time_songs;
create policy "one_time_songs_public_read" on public.one_time_songs
  for select to anon, authenticated using (true);

-- 3) Süresi dolan bekleyen talepleri kapat. Fırsat buldukça çağrılır
--    (yeni talep gelince, admin karar verince) — ayrı bir zamanlayıcı gerekmez.
create or replace function public.expire_song_requests(p_venue_id uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.song_requests
     set status = 'expired', resolved_at = now()
   where status = 'pending'
     and expires_at is not null
     and expires_at < now()
     and (p_venue_id is null or venue_id = p_venue_id);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- 4) request_song: 0044 gövdesi + tek seferlik hak dalı.
--    Katalogda olmayan şarkı, açık bir one_time_songs hakkı varsa eklenebilir;
--    ekleme başarılı olursa hak aynı transaction'da tükenir.
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
  v_cost int;
  v_position int;
  v_username text;
  v_balance int;
  v_one_time_id uuid;
begin
  select request_cost into v_request_cost
    from public.venues where id = p_venue_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  v_cost := case when p_priority then public.priority_cost_now(p_venue_id)
                 else coalesce(v_request_cost, 1) end;

  -- Müşteriye kapalı şarkı: ya admin tek tek gizlemiş (in_venue_list), ya da
  -- şarkının bulunduğu listelerin hepsi müşteriye pasif (playlist_visible).
  if not exists (
    select 1 from public.venue_songs vs
     where vs.venue_id = p_venue_id and vs.song_id = p_song_id
       and vs.in_venue_list and vs.playlist_visible
  ) then
    -- Katalogda yok — mekanın onayladığı tek seferlik hak duruyor mu?
    -- Satır kilitlenir: iki müşteri aynı anda basarsa yalnızca biri alır.
    select id into v_one_time_id
      from public.one_time_songs
     where venue_id = p_venue_id and song_id = p_song_id
       and consumed_at is null and expires_at > now()
     order by expires_at desc
     limit 1
       for update skip locked;

    if v_one_time_id is null then
      return jsonb_build_object('ok', false, 'error', 'not_available');
    end if;
  end if;

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

  -- Müşteri isteğiyle çalan/çalmış şarkı: BAŞLANGIÇ anından itibaren 30 dk kilitli
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

  -- Aynı şarkının otomatik satırı varsa kuyruktan düşer
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

  -- Tek seferlik hak bu eklemeyle tükendi: şarkı artık kimseye görünmez.
  if v_one_time_id is not null then
    update public.one_time_songs
       set consumed_at = now(), consumed_by = p_user_id
     where id = v_one_time_id;
  end if;

  return jsonb_build_object('ok', true, 'cost', v_cost, 'one_time', v_one_time_id is not null);
end
$$;

-- 5) Şarkı detay sayfası (0040 gövdesi): tek seferlik hakkı olan şarkı da
--    "eklenebilir" görünmeli, yoksa müşteri karta dokununca istek düğmesiyle
--    karşılaşır. play_count 0 kalır — katalog satırı yok.
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
    ), false) or exists (
      select 1 from public.one_time_songs o
      where o.venue_id = p_venue_id and o.song_id = (select id from song)
        and o.consumed_at is null and o.expires_at > now()
    ),
    'is_favorite', case when auth.uid() is null then false else exists(
      select 1 from public.user_favorites f
      where f.user_id = auth.uid() and f.song_id = (select id from song)
    ) end,
    'token_balance', case when auth.uid() is null then 0 else coalesce((
      select balance from public.user_wallets where user_id = auth.uid()
    ), 0) end,
    -- Çapa çalmaya başlama anı; çalmakta olan müşteri şarkısı da dahil
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

-- 6) Push abonelikleri artık mekan adminlerini de taşıyor.
--    Admin oturumu Supabase auth kullanıcısı değil (imzalı çerez, venue_admins
--    satırı) — bu yüzden user_id null olabilir, ikisinden biri dolu olmalı.
alter table public.push_subscriptions
  alter column user_id drop not null;

alter table public.push_subscriptions
  add column if not exists admin_id uuid references public.venue_admins (id) on delete cascade;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_owner_present;
alter table public.push_subscriptions add constraint push_subscriptions_owner_present
  check (user_id is not null or admin_id is not null);

create index if not exists push_subscriptions_admin_idx
  on public.push_subscriptions (admin_id);

commit;

-- 7) Realtime: onay/iptal anında müşteri panelinde yansısın
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'one_time_songs'
    ) then
      alter publication supabase_realtime add table public.one_time_songs;
    end if;
  end if;
end
$$;

-- PostgREST şema önbelleğini tazele: yeni tablo/kolonlar hemen görünsün
notify pgrst, 'reload schema';
