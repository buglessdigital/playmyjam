-- 0035: Müşteri isteği, aynı şarkının otomatik satırını devralır.
--
-- Sorun neydi: kuyrukta otomatik doldurmayla (added_by='auto', user_id null)
-- bekleyen bir şarkıyı müşteri de sıraya ekleyebiliyordu. request_song'daki
-- "zaten sırada" kontrolü sadece user_id is not null satırlarına baktığı için
-- iki satır yan yana duruyor ve aynı şarkı arka arkaya iki kez çalıyordu.
--
-- Çözüm: müşterinin isteği kabul edildiğinde, aynı şarkının kuyrukta BEKLEYEN
-- otomatik satırı 'removed' yapılır. Şarkı artık yalnızca müşterinin eklediği
-- haliyle (jeton, öncelik, kullanıcı adı) sırada durur.
--
-- Dokunulmayanlar:
--   * Adminin elle eklediği satırlar (added_by='admin'): admin bilerek koymuştur,
--     otomatik dolum satırı değildir — resetAutoQueue/trim mantığıyla aynı çizgi.
--   * Sahnede çalan satır: 'playing' kuralı zaten isteği reddediyor.
--   * playlist_rotation_consumed: şarkı yine de çalacağı için tüketilmiş sayılır,
--     rotasyon aynı turda tekrar seçmesin diye geri alınmaz.
--
-- Kuyruk 10'un altına düştüğü için POST /api/queue'daki fillQueueToTen boşluğu
-- yeni bir otomatik şarkıyla doldurur; ekstra kod değişikliği gerekmez.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0034'ten SONRA çalıştırın.
-- Sıralama: SQL tek başına yeterli, kod deploy'u gerektirmez.

begin;

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

revoke execute on function public.request_song(uuid, uuid, uuid, boolean) from public, anon, authenticated;

commit;
