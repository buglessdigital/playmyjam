---
name: pmj-admin-pwa-2026-08
description: "Her mekan admini kendi panelini ayrı PWA olarak kurabilir; manifest+ikon route'ları proxy'de muaf tutulmalı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 16594979-44b1-4709-b6c8-6c364715538d
  modified: 2026-08-13T12:16:16.002Z
---

12 Ağu 2026: mekana özel kurulabilir panel uygulaması eklendi. `app/admin/[venueId]/manifest.webmanifest`
(id/start_url/scope = `/admin/{slug}`, ad+logo mekandan) ve `app/admin/[venueId]/app-icon/[size]` (ImageResponse
ile 192/512 PNG; logo yalnızca png/jpeg gömülür, değilse baş harf). Panel layout'u metadata için sunucuya alındı,
istemci kabuğu `components/admin/AdminPanelShell.tsx`'e taşındı. Kurulum kartı: Ayarlar sayfası, `InstallAppCard`.

**Why:** Tarayıcı manifest'i çerezsiz (credentials: omit) ister — `proxy.ts`'te bu iki yol admin oturum
kontrolünden MUAF tutulmasaydı login'e düşer ve kurulum hiç açılmazdı. Ayrıca kurulumlar manifest `id`'sine göre
ayrıldığı için id mekan başına farklı olmak zorunda.

13 Ağu 2026: aynısı MÜŞTERİ tarafına da eklendi — `app/venue/[venueId]/manifest.webmanifest`
ve `.../app-icon/[size]`, ikon üretimi ortak `lib/venue-app-icon.tsx`. Talep gönderildikten
sonraki kart (`components/browse/NotifyOptIn.tsx`) iki aşamalı: önce kurulum, sonra bildirim
izni — iPhone'da push yalnızca kurulu uygulamada çalıştığı için sıra zorunlu.

**How to apply:** Panel altına yeni public varlık eklenirse proxy muafiyetini de güncelle
(hem /admin hem /venue dalında muafiyet var). Logo değişince
`venue-{slug}` tag'i revalidate ediliyor (api/admin/logo), ikon oradan tazeleniyor. iOS'ta kurulu uygulama
Safari'den ayrı çerez kabı kullanır — admin uygulamada bir kez daha giriş yapar. Gerçek cihazda kurulum
denemesi henüz yapılmadı. İlgili: [[pmj-player-offline-gate-2026-08]], [[pmj-venue-logo-2026-08]]

24 Eyl 2026: Android'de panel "Bu uygulama yüklenemez" diyordu. Sebep: dinamik sayfalarda Next 16
generateMetadata çıktısını <body>'ye akıtıyor, Chrome body'deki manifest'i görmüyor (CDP
Page.getInstallabilityErrors → "no-manifest"). Çözüm (88dc1e3): kök layout <head>'inde inline script
/admin|venue/{slug} için manifest + apple-touch-icon bağlantısını head başına ekliyor. Doğrulama:
headless Chrome + CDP (imzalı admin çereziyle) — prod'da hata yok. Mekana özel metadata eklerken
<head>'e düşeceğini varsayma.
