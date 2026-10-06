---
name: pmj-resend-smtp
description: "Auth mailleri Resend SMTP'den gidiyor (2026-07-30) — username sabit 'resend', şifre API anahtarı; DNS TurkTicaret'te"
metadata: 
  node_type: memory
  type: project
  originSessionId: 02e62839-62c3-46a4-ae54-12707fbc51a8
  modified: 2026-07-30T11:49:54.079Z
---

2026-07-30'da Supabase custom SMTP kuruldu: auth mailleri `PlayMyJam <noreply@playmyjam.com.tr>` adresinden Resend üzerinden gidiyor (Ireland/eu-west-1, ücretsiz katman 100/gün + 3.000/ay). Yerleşik Supabase servisinin saatlik ~2 mail sınırı ve "powered by Supabase" footer'ı böylece kalktı. DNS kayıtları (DKIM `resend._domainkey`, MX + SPF `send`, DMARC `_dmarc` p=none) **TurkTicaret DNS Pro** panelinde; alan adı Vercel'e A kaydıyla bağlı (`76.76.21.21`).

**Why:** Şifre sıfırlama ve kayıt onayı yerleşik mail servisiyle pratikte çalışmıyordu — saatte 2 mail, ürün canlı ve ödeme alıyor.
**How to apply:** Supabase SMTP ayarında **Username her zaman `resend`** (e-posta adresi DEĞİL), **Password ise API anahtarının tam metni** (`re_...`) — Resend'in ayrı SMTP şifresi yok. `535 "Authentication credentials invalid"` hatası neredeyse her zaman Resend panelindeki listeden **maskeli/kısaltılmış** anahtarın kopyalanmasından çıkar. Mail gitmiyorsa hatanın ham hali Supabase → Logs → Auth Logs'ta görünür; `/recover` ucunu doğrudan anon key ile POST'layarak 500/200 ayrımı hızlıca yapılabilir. 100 mekan ölçeğinde Resend Pro ($20/ay, 50k) gerekecek; Supabase tarafında "Rate limit for sending emails" ayrıca yükseltilmeli (custom SMTP sonrası varsayılan 30/saat). IP başına çalışan Supabase limitleri mekan WiFi'ı ve mobil CGNAT yüzünden erken dolar — sign-ups/sign-ins ve token refreshes değerleri yükseltildi.
