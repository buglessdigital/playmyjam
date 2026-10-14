---
name: pmj-acik-tema-2026-10
description: Müşteri paneli açık teması — renkler --pmj-* değişkenlerinde, html[data-theme="light"] yalnız /venue/ altında; seçici onaya kadar beta işaretli cihazda
metadata:
  type: project
---

**Kapsam (14 Eki 2026):** yalnız müşteri paneli (`/venue/<slug>/…`). Mekan paneli, vitrin, super admin hep koyu. Seçim cihazda: localStorage `pmj-theme` = `dark` (varsayılan) | `light` | `system`.

**Nasıl çalışıyor:**
- Renkler `app/globals.css`'te `--pmj-*` değişkenleri; Tailwind'e `bg-canvas`, `bg-surface`, `bg-sheet`, `text-ink`, `bg-ink/10`, `text-muted`, `text-subtle`, `text-faint`, `text-gold`… olarak bağlı. Koyu değerler `:root`'ta (eski sabitlerin birebir aynısı), açık değerler `html[data-theme="light"]`'ta. Satır içi stiller `var(--pmj-surface)`, `rgb(var(--pmj-ink-rgb) / 0.08)` biçiminde.
- `data-theme`'i ilk boyamadan önce kök layout'taki `THEME_BOOT_SCRIPT` (`lib/theme-boot.ts`) koyar, sonra `components/venue/ThemeSync.tsx` yönetir; panelden çıkınca kaldırır. `applyTheme` ayrıca `theme-color` meta'sını ve uygulamanın status bar'ını (`nativeSetSystemBars`) günceller.
- SVG sunum öznitelikleri (`stroke="#6b7280"`) kodda kaldı; açık temada `globals.css`'teki öznitelik seçicileri ezer. Koyu zemine göre seçilmiş açık Tailwind tonları (`text-red-400`, `text-[#4ade80]`…) da orada koyulaştırılır.
- Harita: `lib/map-style.ts` iki palet (DARK/LIGHT), tema değişince harita yeniden kurulur.
- Hep koyu kalanlar: şu an çalan plağı, karekod okuyucu (kamera üstü).

**Kontrast turu (14 Eki 2026):** açık temada gri tonlar ölçümle koyulaştırıldı (muted/subtle ≥5:1, faint yalnız süs/minik yazı ~3.3:1), pembe yazı açıkta `--pmj-pink-text` (#c4127a). Sabit `"white"` renkler betikten kaçmıştı (sözler bu yüzden okunmuyordu) — düz zemindekiler `var(--pmj-ink)`. Kapak/fotoğraf üstündeki yarı saydam siyah rozetlere `on-media` sınıfı: içinde değişkenler koyu temaya döner. Tarama betiği: sayfadaki her yazı/ikonun rengini zeminiyle WCAG oranına vurur (gradyanlar ortalama, görsel üstü yanlış alarm verir).

**Yeni müşteri bileşeni yazarken:** `#0f0a18`/`text-white`/`bg-white/10` YAZMA → `bg-canvas`/`text-ink`/`bg-ink/10`. Pembe/mor dolu düğmede yazı `text-white` kalır (her temada beyaz). Kapak üstü rozet → `on-media`. Pembe *yazı* → `text-[#e91e8c]` (CSS açıkta koyulaştırır) ya da `var(--pmj-pink-text)`; pembe *zemin* sabit kalır.

**GEÇİCİ:** seçici (profil + ayarlar) yalnız localStorage `pmj-theme-beta=1` olan cihazda görünür (`useThemeBeta`, `lib/theme.ts`). Kullanıcı onaylayınca kanca ve iki kullanımı silinecek. Bkz. [[pmj-mobil-uygulama-2026-10]].
