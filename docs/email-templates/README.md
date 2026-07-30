# Auth e-posta şablonları

Supabase Dashboard → **Authentication → Emails** altındaki şablonların kaynağı.
Dashboard'da yapılan değişiklik burada da güncellenmeli — tersi de geçerli.

| Şablon | Dosya | Konu başlığı |
|---|---|---|
| Confirm signup | `confirm-signup.html` | `PlayMyJam hesabını doğrula` |
| Reset Password | `reset-password.html` | `PlayMyJam şifreni sıfırla` |

## Nasıl uygulanır

1. Authentication → Emails → ilgili şablonu seç
2. **Subject heading** alanına yukarıdaki başlığı yaz
3. **Message body**'yi dosyanın içeriğiyle değiştir (baştaki HTML yorumu kalabilir)
4. Save

## Dikkat

- `{{ .ConfirmationURL }}` değişkeni yerinde kalmalı. Uygulama tarafı
  (`app/auth/confirm/route.ts`, `app/auth/reset/page.tsx`, `proxy.ts`) hem bu biçimi
  hem `token_hash` biçimini karşılıyor, ama değişken silinirse link hiç çalışmaz.
- Gönderen adı/adresi şablondan değiştirilemez; `Supabase Auth
  <noreply@mail.app.supabase.io>` olarak kalır. Değiştirmek için
  Project Settings → Authentication → SMTP Settings'ten custom SMTP tanımlanmalı.
- Yerleşik e-posta servisi saatlik gönderim sınırına tabidir ve alt kısımdaki
  "powered by Supabase" satırı kaldırılamaz. Custom SMTP ikisini de çözer.
- Gövde satır içi (inline) CSS ile ve tablo düzeniyle yazıldı; e-posta istemcileri
  `<style>` bloklarını ve flex/grid'i güvenilir şekilde desteklemiyor.
