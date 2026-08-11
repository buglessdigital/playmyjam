-- 0044: Öncelikli istek ücreti artık dinamik — sıra doldukça pahalılaşır.
--
-- Bugüne kadar öncelikli fiyat sabitti (venues.priority_cost). Sıra uzadıkça
-- öne geçmenin değeri artıyor ama fiyatı sabit kalıyordu: 10 kişilik kuyrukta da
-- boş kuyrukta da aynı jeton.
--
-- Yeni kural:
--   öncelikli fiyat = venues.priority_cost + floor(bekleyen_normal_şarkı / 3)
--
-- "bekleyen normal şarkı" = müşterinin jetonla NORMAL seçenekle eklediği,
-- hâlâ kuyrukta bekleyen satırlar (status='queued', user_id not null,
-- priority=false). Otomatik doldurma (user_id null) ve adminin elle eklediği
-- satırlar SAYILMAZ: onlar için jeton ödenmedi, ayrıca auto-fill kuyruğu sürekli
-- 10'a tamamladığı için fiyat kalıcı olarak tavanda kalırdı.
--
-- Üst sınır bilerek yok: normal ücret ödeyen kuyruk doğal olarak kısa kalıyor.
--
-- Müşteri arayüzü aynı formülü yerelde hesaplar (lib/pricing.ts) — gösterilen
-- rakamın kaynağı zaten elindeki queue_entries listesi, ekstra sorgu yok.
-- Ekranla kesilen jeton arasında (başkası tam o anda şarkı eklerse) fark oluşursa
-- request_song artık gerçek ücreti 'cost' alanıyla döndürüyor; istemci iyimser
-- düşümünü buna göre düzeltiyor.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0043'ten SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u. SQL tek başına da tutarlıdır —
-- eski kod yalnızca fiyatı taban değerinde gösterir, kesilen ücret doğrudur.

begin;

-- 1) Tek doğruluk kaynağı: bir mekanda ŞU AN öncelikli isteğin jeton ücreti.
--    lib/pricing.ts içindeki priorityCostFor bunun birebir aynası.
create or replace function public.priority_cost_now(p_venue_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select v.priority_cost from public.venues v where v.id = p_venue_id), 2)
       + (
           select (count(*) / 3)::int
             from public.queue q
            where q.venue_id = p_venue_id
              and q.status = 'queued'
              and q.user_id is not null
              and not q.priority
         );
$$;

grant execute on function public.priority_cost_now(uuid) to anon, authenticated;

-- 2) request_song: 0040 gövdesinin aynısı; yalnızca öncelikli ücret hesabı
--    dinamikleşti ve başarı yanıtına kesilen ücret ('cost') eklendi.
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
begin
  select request_cost into v_request_cost
    from public.venues where id = p_venue_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'venue_not_found');
  end if;

  -- Öncelikli ücret kuyruğun o anki haline bağlı; normal ücret sabit.
  -- Hesap, aşağıdaki auto satır devrinden ÖNCE yapılır — ama auto satırlar
  -- (user_id null) zaten sayıma girmediği için sıralamanın bir etkisi yok.
  v_cost := case when p_priority then public.priority_cost_now(p_venue_id)
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

  -- 'cost': istemci iyimser jeton düşümünü gerçek ücretle eşitlesin diye
  return jsonb_build_object('ok', true, 'cost', v_cost);
end
$$;

commit;
