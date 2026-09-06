-- songs.channel_id — havuzu kendi kendine büyütmenin anahtarı.
--
-- Neden: katalog bugüne kadar elle toplanan playlist bağlantılarıyla büyüdü.
-- Oysa videos.list yanıtı zaten snippet.channelId'yi döndürüyor, biz atıyorduk.
-- Kanal kimliği elde olunca yüklemeler listesi saf string dönüşümüyle bulunuyor
-- (UCxxx -> UUxxx, sıfır kota) ve o liste bir sanatçının TÜM resmi diskografisi
-- demek. Ölçüldü: "The Weeknd - Topic" yüklemeleri = 967 şarkı, ~20 birim.
--
-- Böylece tohumlama kendi kendini besler: yeni şarkı -> yeni kanal -> yeni şarkı.
-- Bkz. scripts/seed-catalog.ts --harvest.

alter table public.songs add column if not exists channel_id text;

-- Hasat turu "kanal kimliği henüz bilinmeyen" satırları tarıyor; kısmi indeks
-- hem bu taramayı hem de distinct kanal listesini ucuzlatıyor.
create index if not exists songs_channel_id_missing_idx
  on public.songs (id)
  where channel_id is null;

create index if not exists songs_channel_id_idx
  on public.songs (channel_id)
  where channel_id is not null;

-- songs'ta izinler KOLON BAZINDA verilmiş: yeni kolon otomatik miras almaz ve
-- grant edilmezse tohumlama betiği (service_role) satırı yazamaz.
grant select (channel_id), insert (channel_id), update (channel_id)
  on public.songs to anon, authenticated, service_role;
