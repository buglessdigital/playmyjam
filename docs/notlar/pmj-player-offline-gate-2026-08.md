---
name: pmj-player-offline-gate-2026-08
description: Player kapalıyken müşteri panelinde süreler gizli ve şarkı ekleme kapalı (5 Ağu 2026)
metadata: 
  node_type: memory
  type: project
  originSessionId: 6f246cd2-0d10-4a03-a133-03013b74998b
  modified: 2026-08-05T15:58:20.755Z
---

Mekanın oynatıcısı kapalıyken (now_playing.last_heartbeat_at 45 sn'den eski) müşteri paneli
süre/ilerleme göstermez ve şarkı eklemeye izin vermez. Migration gerekmedi — heartbeat kolonu zaten vardı.

- Eşik + saf kontrol: `lib/player-status.ts` (sunucu+istemci ortak), React kancası `lib/use-player-online.ts`.
- Sunucu kapısı `/api/queue` içinde: 409 + `code: "player_offline"`.
- `YouTubePlayer` artık kuyruk boşken de `{action:"heartbeat", presence:true}` yollar; sunucu bu kolda
  yalnızca last_heartbeat_at + claim yazar. Bu olmasaydı boş mekanda player açıkken ekleme kilitlenirdi.
- Serbest metin öneri (`/api/venue/[id]/request`) kapatılmadı: jeton harcamıyor.
- Sözlük bölümü `playerOffline` (tr/en + en.source.json elle dolduruldu).

**Why:** Player kapalıyken eklenen şarkı çalmıyor, müşterinin jetonu boşa gidiyordu.
**How to apply:** "Oynatıcı açık mı?" sorusu her zaman heartbeat tazeliğinden okunmalı;
yeni ekleme yolları açılırsa hem UI hem `/api/queue` kapısı gözden geçirilmeli.
İlgili: [[pmj-playing-cooldown-2026-08]], [[pmj-i18n-2026-08]]
