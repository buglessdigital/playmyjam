# PMJ CRM — Faz Planı

Super admin paneline mekan satış hattı, sözleşme/komisyon, hakediş ve gelir-gider
takibi ekleyen sistemin uygulama planı.

## Varsayımlar (aksi söylenene kadar geçerli)

| Konu | Karar |
|---|---|
| Kapsam | Faz faz; her faz tek başına kullanılabilir halde bitirilir |
| Komisyon tabanı | **Harcama bazlı** — jetonun tüketildiği mekan hak eder (`wallet_transactions.kind='spend'`), satın alındığı mekan değil |
| Komisyon yönü | Biz mekana pay veriyoruz → hakediş bizim **giderimiz** |
| Hatırlatma kanalı | Faz 1–3 panel içi liste; push/mail Faz 4 |
| Ekip | Tek kişi, ama `owner` alanı baştan konur (sonradan şema değişmesin) |
| DDL | Migration dosyalarını ben yazarım, Supabase SQL Editor'da kullanıcı çalıştırır |

Tüm CRM tablolarında RLS açık + **politika yok**; erişim yalnızca super-admin route
handler'larından (service-role). `venue_applications`'taki desenin aynısı.

---

## Faz 1 — Satış hattı (CRM çekirdeği)

Amaç: kapı kapı gezilen mekanların nerede kaldığını tek ekrandan görmek.

### Migration `0038_crm_core.sql`

- **`crm_leads`** — `venue_applications`'ın genişletilmişi ve halefi
  `venue_name, contact_name, phone, email, city, district, address, venue_type,
  source (form|cold|referral|import|other), stage (new|contacted|meeting|proposal|won|lost),
  owner, lost_reason, next_action_at, last_contact_at, venue_id (anlaşınca dolar),
  application_id, notes, ip, user_agent, created_at, updated_at`
  Index: `(stage, next_action_at)` ve `(created_at desc)`
- **`crm_activities`** — `lead_id | venue_id, type (call|visit|whatsapp|email|meeting|note),
  body, happened_at, created_at`
- **`crm_tasks`** — `lead_id | venue_id, title, kind (followup|payout|contract_renewal|custom),
  due_at, done_at, auto_key (unique, cron'un çift görev açmasını engeller), created_at`
- Mevcut `venue_applications` satırları `crm_leads`'e kopyalanır
  (`new→new, contacted→contacted, approved→won, rejected→lost`).
  Eski tablo **silinmez**, arşiv olarak durur.

### Kod

- `app/api/super-admin/crm/leads/route.ts` + `[id]/route.ts` (liste, oluştur, güncelle, aşama değiştir)
- `app/api/super-admin/crm/activities/route.ts`
- `app/api/super-admin/crm/tasks/route.ts`
- `app/api/venue-applications/route.ts` → artık `crm_leads`'e yazar (`source='form'`)
- `app/super-admin/(panel)/crm/page.tsx` — aşama sütunlu pano (mobilde liste)
- `app/super-admin/(panel)/crm/[leadId]/page.tsx` — detay: bilgiler, zaman çizelgesi,
  görev ekle, "Mekana dönüştür" (mevcut `/venues/new` formunu ön-dolu açar)
- `app/super-admin/(panel)/crm/tasks/page.tsx` — Gecikmiş / Bugün / Bu hafta
- `/super-admin/applications` → `/super-admin/crm`'e redirect
- Sidebar: **Mekan Talepleri** yerine **CRM** + rozet (gecikmiş görev sayısı)

### Bitti sayılma ölçütü
Form kaydı lead olarak düşüyor, aşaması sürüklenip değiştirilebiliyor, her temas
zaman çizelgesine yazılıyor, "3 gün sonra ara" görevi açılıp gecikince listede
kırmızı görünüyor, kazanılan lead mekan kaydına bağlanıyor.

---

## Faz 2 — Sözleşme ve hakediş

Amaç: anlaşılan mekanın oranını tutmak, dönem sonunda ne ödeneceğini otomatik hesaplamak.

### Migration `0039_crm_contracts.sql`

- **`venue_contracts`** — `venue_id, commission_rate numeric(5,2), fixed_fee, min_guarantee,
  period (monthly|biweekly), payout_day int, starts_on, ends_on, iban, legal_name, tax_no,
  status (draft|active|ended), notes`
  Oran değişimi = yeni satır (tarih aralıklı). Mekan başına aynı anda tek `active`
  satır: partial unique index.
- **`venue_payouts`** — `venue_id, contract_id, period_start, period_end, tokens_spent,
  unit_price, gross, rate, amount, status (draft|approved|paid), paid_at, reference, note`
  `(venue_id, period_start)` unique — aynı dönem iki kez hesaplanamaz.
- **RPC `calc_venue_payout(p_venue_id, p_start, p_end)`** —
  `wallet_transactions` içinden `kind='spend'` ve o mekanın satırlarının mutlak
  toplamı × `app_settings.token_unit_price` × dönemdeki `commission_rate`.
  Sadece hesaplar, yazmaz; panel önizleme için de aynı fonksiyonu çağırır.

### Kod

- `app/api/super-admin/crm/contracts/route.ts` + `[venueId]`
- `app/api/super-admin/crm/payouts/route.ts` — dönem üret / önizle / onayla / ödendi işaretle
- `app/super-admin/(panel)/venues/[venueId]/edit` → **Sözleşme** sekmesi
- `app/super-admin/(panel)/finance/payouts/page.tsx` — dönem seçici, mekan başına
  jeton/brüt/oran/hakediş tablosu, toplu onay, IBAN kopyala
- `app/api/cron/crm-reminders/route.ts` (günlük) — ödeme günü T-3, sözleşme bitişi T-30,
  14 gündür dokunulmamış lead → `crm_tasks`'e `auto_key` ile görev açar

### Bitti sayılma ölçütü
Mekana %oran ve ödeme günü girilebiliyor; ay kapanınca hakediş satırı tek tıkla
üretiliyor, rakam elle kontrol edilebiliyor, "ödendi" işaretlenip dekont referansı
yazılabiliyor; ödeme günü yaklaşınca görev kendiliğinden düşüyor.

---

## Faz 3 — Gelir–gider defteri ve raporlar

### Migration `0040_crm_finance.sql`

- **`finance_entries`** — `kind (income|expense), category, label, amount, occurred_on,
  venue_id, payout_id, source (manual|auto_payment|auto_payout), external_id, note`
  `(source, external_id)` unique — otomatik aktarım tekrar çalışsa da çift kayıt olmaz.
- Kategoriler: gelir → `token_sale`; gider → `venue_payout, infra, api_quota, marketing,
  travel, staff, print, other`

### Kod

- `payment_orders.status='success'` → gelir satırı; `venue_payouts.status='paid'` → gider satırı
  (ödeme onaylanırken aynı route içinde yazılır, ayrıca geriye dönük doldurma scripti)
- `app/api/super-admin/crm/finance/route.ts` — elle kalem ekle/sil/listele
- `app/super-admin/(panel)/finance/page.tsx` — aylık brüt gelir / mekan payı / diğer
  giderler / net kâr kartları + kategori kırılımı + aylık trend
- Mekan bazlı kârlılık tablosu: mekan → gelir, ödenen pay, net katkı
- CSV dışa aktarım (muhasebeye gidecek)

### Bitti sayılma ölçütü
Ay sonunda "ne kazandık, ne ödedik, cebimizde ne kaldı" tek ekranda; iyzico satışları
ve mekan hakedişleri elle girilmeden orada.

---

## Faz 4 — Saha ve büyüme araçları

Şema değişikliği çoğunlukla yok; Faz 1–3 verisinin üstüne biner.

- **Mekan sağlık skoru** — son 7/30 günde çalınan şarkı, harcanan jeton, player
  heartbeat süresi. "Sözleşmesi var, 3 haftadır player açılmamış" uyarısı → otomatik görev
- **Harita görünümü** — lead'lerin `lat/lng` pinleri, aşamaya göre renk, rota planı
- **Toplu içe aktarma** — `izmir_mekan_listesi.xlsx` → CSV → lead (`source='import'`)
- **Push/mail hatırlatma** — mevcut push altyapısı üzerinden super admin'e günlük özet
- **Mekan panelinde "Kazancım"** — mekan kendi hakedişini görsün (telefon trafiğini keser)
- **Teklif/sözleşme PDF** — mekan bilgileri + oran ön-dolu
- **Dönüşüm raporu** — kaynak bazlı ziyaret→anlaşma oranı, hedef takibi
- **WhatsApp derin bağlantısı** — karttaki numaraya tek tıkla mesaj

---

## Uygulama sırası ve riskler

1. Her fazda **önce SQL, sonra kod deploy'u** (tablo yokken route 500 döner).
2. `venue_applications` → `crm_leads` geçişinde form route'u ile migration aynı
   deploy'da buluşmalı; eski tablo silinmediği için geri dönüş mümkün.
3. Hakediş rakamı para demek: Faz 2'de RPC'nin çıktısı bir dönem boyunca elle
   doğrulanmadan "ödendi" akışı açılmaz.
4. `wallet_transactions` ledger'ı 0012'den itibaren dolu — ondan öncesi için
   geçmişe dönük hakediş hesaplanamaz, dönem başlangıcı buna göre seçilmeli.
