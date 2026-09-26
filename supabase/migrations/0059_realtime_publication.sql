-- Realtime yayınına alınan tablolar. Prod'da bunlar dashboard'dan açılmıştı ve
-- hiçbir migration'da yoktu — sıfırdan kurulan bir veritabanında (test projesi)
-- kuyruk/çalan şarkı/talep değişiklikleri istemcilere hiç ulaşmıyordu.
-- Tablo zaten yayındaysa atlanır; prod'da etkisizdir.
do $$
declare
  t text;
begin
  foreach t in array array['queue', 'now_playing', 'song_requests'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
