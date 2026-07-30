-- Sunucu tarafı hız sınırlayıcı. Bellekte tutulan sayaç Vercel'de işe yaramaz:
-- her fonksiyon örneği kendi sayacını tutar ve saldırgan örnek değiştirerek sınırı
-- aşar. Sayaç bu yüzden veritabanında, tüm örnekler arasında paylaşımlı.
--
-- Sabit pencere (fixed window) yaklaşımı: pencere başına düşen istek sayılır.
-- Login gibi düşük hacimli uçlar için yeterli, kayan pencerenin maliyetine değmez.

create table if not exists public.rate_limit_hits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);

-- Tablo istemciye tamamen kapalı: politika yok, yalnızca SECURITY DEFINER
-- fonksiyonu ve service-role erişir.
alter table public.rate_limit_hits enable row level security;

create index if not exists rate_limit_hits_window_idx
  on public.rate_limit_hits (window_start);

create or replace function public.consume_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'geçersiz limit/pencere';
  end if;

  -- Şimdiki zamanı pencere başlangıcına yuvarla
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_hits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start)
    do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Eski pencereleri ara sıra topla; ayrı bir cron'a gerek kalmasın
  if random() < 0.01 then
    delete from public.rate_limit_hits where window_start < now() - interval '1 day';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'retry_after', greatest(
      0,
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds)) - now()))
    )::int
  );
end;
$$;

-- Fonksiyon yalnızca sunucudan (service-role) çağrılabilir; anon/authenticated
-- kendi sayacını sıfırlayacak şekilde oynayamasın.
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- PostgREST şema önbelleğini tazele: yeni fonksiyon hemen çağrılabilsin
notify pgrst, 'reload schema';
