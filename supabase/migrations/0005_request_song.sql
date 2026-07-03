-- Şarkı ekleme akışını tek transaction'a indirger.
-- Önceki akış API rotasında 5-6 sıralı sorgu yapıyordu (cooldown, playing, jeton,
-- pozisyon, profil, insert) — bu fonksiyon hepsini tek round-trip'te, atomik yapar.
-- Insert başarısız olursa jeton düşümü de otomatik geri alınır (aynı transaction).
-- Uygulama: Supabase Dashboard > SQL Editor'da bu dosyayı çalıştırın.
-- Yalnızca service-role çağırır (API rotası).

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

  -- Atomik jeton düşümü (0001'deki fonksiyon)
  if not public.spend_tokens(p_user_id, p_venue_id, v_cost) then
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
