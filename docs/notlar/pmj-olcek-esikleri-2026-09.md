---
name: pmj-olcek-esikleri-2026-09
description: Büyük ölçek işleri ŞİMDİ yapılmıyor — hangisinin hangi ölçümle tetikleneceği (28 Eyl 2026 kararı)
metadata:
  type: project
---

28 Eyl 2026'da kullanıcıyla karar: 2000 mekan altyapısı önden KURULMAZ; bugün de
hızlandıran işler yapıldı ([[pmj-canli-yayin-2026-09]], yük testi), gerisi aşağıdaki
eşik aşılınca yapılır. Kod bu geçişlere kapalı değil; her biri birkaç günlük iş.

| İş | Tetikleyici | Not |
|---|---|---|
| Redis (Upstash, Marketplace) — rate limit + kuyruk kilidi | `consume_rate_limit` / 0046 kilidi Supabase "Query performance"ta üst sıralara çıkınca | Kuyruk DURUMUNU Redis'e taşıma: iki doğru kaynak olur |
| Heartbeat'i Vercel'den çıkar (5 sn → doğrudan RPC ya da presence) | Vercel fonksiyon çağrısı maliyeti aylık faturada kalem olunca (~100 mekan) | Mekan başına ayda ~260k çağrı ([[pmj-yayilim-plani-2026-09]]) |
| Admin paneli / player postgres_changes → Broadcast | Realtime "postgres_changes" gecikmesi dashboard'da >1 sn ya da ~300 mekan | Şu an mekan başına 1-2 abone, her heartbeat'te panel now_playing okuyor |
| Cron'ları kuyruğa böl (Vercel Queues/Workflow) | Herhangi bir cron 150 sn'yi aşınca | metadata tazeleme 39k satır 61 sn ([[pmj-metadata-tazeleme-2026-09]]) |
| Arama servisi (Typesense/Meili) | Arama p95 >300 ms ya da akşam Postgres CPU'sunun belirgin payı aramadan | trigram şu an yetiyor ([[pmj-songs-trigram-2026-09]]) |
| Read replica | Akşam Postgres CPU >%60 sürekli | Replika gecikmesi: bakiye/ödeme okumaları ANA veritabanında kalmalı |
| Analitik ayrı depoya (ui_events) | ui_events tablo boyutu DB'nin büyük kısmı olunca | 0058 |
| Mekan/bölge bazlı veritabanı bölme | Muhtemelen hiç; 2000+ mekanda tek büyük Postgres + replika yeter | |

**Why:** Ürün hâlâ hızlı değişiyor, ekip iki kişi; önden kurulan her servis bakım yükü
ve sabit maliyet, yanlış yere optimizasyon riski.
**How to apply:** Yeni mekan dalgasından (5→30→100…) önce `npm run load:venue`'yu
o dalganın telefon sayısıyla staging'de koştur ve Supabase/Vercel metriklerine bak;
tabloda eşiği aşan satır varsa o iş sıraya girer. "Şimdiden kuralım" önerisi gelirse bu karara dayan.

**6 Eki 2026 — 30 eşzamanlı player testi (`npm run load:players`, staging):** 30 mekan ×
(player + panel) + mekan başına 5 telefon, şarkı geçişleri gerçek `playNextFromQueue` ile.
Dağınık tempo (5 dk, 200 geçiş) ve fırtına (hepsi aynı saniyede, 171 geçiş): geçiş hatası
0, `busy` 0, heartbeat p95 ~155 ms, geçiş p95 ≤720 ms, bitiş→yeni şarkı player'da p95 <1 sn,
broadcast kaybı 0, kanal hatası 0, DB bağlantısı sabit 25. 30 mekanda tablodaki hiçbir eşik
tetiklenmiyor. Ölçülmeyen: Vercel fonksiyon katmanı (heartbeat sorguları doğrudan DB'ye gitti).
Maliyet notu: player-bus 1 sn'lik broadcast'i 30 mekanda günde 12 saatle ayda ~39M Realtime
mesajı eder — bozulma değil fatura kalemi; mesaj kotası aşılırsa ilk kısılacak şey STATE_BEAT_MS.
