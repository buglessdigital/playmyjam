-- songs için otomatik vacuum/analyze eşikleri. Varsayılan %20: ~880 bin
-- satırda ~177 bin ölü satır birikmeden vacuum çalışmıyordu (30 Eyl 2026:
-- son vacuum 22 Eyl, 106 bin ölü satır). Günlük metadata tazeleme ~44 bin
-- satırı güncelliyor; ölü kayıtlar hem tazeleme yazmalarını hem index-only
-- taramaları (catalog_topic_uploads, 355 bin heap fetch) yavaşlatıyordu.
-- %2 ≈ 18 bin satırda bir; hasat eklemeleri de görünürlük haritasını
-- güncellesin diye insert eşiği de aynı. Tablo kilidi okuma/yazmayı engellemez.
alter table public.songs set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02
);
