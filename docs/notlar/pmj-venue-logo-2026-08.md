---
name: pmj-venue-logo-2026-08
description: "Mekan logosu Supabase Storage'daki public \"venue-logos\" bucket'ında; migration yok, bucket ilk yüklemede kod tarafından açılıyor"
metadata: 
  node_type: memory
  type: project
  originSessionId: e6d81309-3bbe-4b09-affa-53856296df77
  modified: 2026-08-06T23:00:33.471Z
---

Mekan logoları (7 Ağu 2026): `venues.logo_url` kolonu zaten vardı, **migration gerekmedi**.
Dosyalar Supabase Storage'da public `venue-logos` bucket'ında (2 MB limit, png/jpg/webp/gif;
SVG bilerek yok). Bucket prod projede oluşturuldu; `/api/admin/logo` içindeki `ensureBucket()`
yoksa service role ile açtığı için başka bir ortamda ayrıca SQL/panel adımı gerekmez.
Yol düzeni `venue-logos/{venue_id}/{uuid}.{ext}` — yeni yükleme eskileri siler.
Logo değişince `venue-{slug}` + `venues-list` tag'leri revalidate edilir (bkz.
[[next16-updatetag-route-handlers]]).

**Why:** Depolama, DDL migration'larının dışında kaldığı için migration listesine bakarak
"eksik bir şey var mı" denince görünmez.

**How to apply:** Yeni bir Supabase projesine geçilirse bucket'ı elle açmaya gerek yok, ilk
logo yüklemesi açar; ama service role anahtarının storage yetkisi şart.
