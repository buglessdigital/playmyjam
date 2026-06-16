-- Bağlanan Spotify hesabının kimliği panelde gösterilir; yanlış hesaba bağlanma fark edilebilsin.
-- Kolon bazlı grant (0002) bu kolonları anon/authenticated'a açmaz — sadece service role okur.
alter table public.venues
  add column if not exists spotify_account_id text,
  add column if not exists spotify_account_name text;
