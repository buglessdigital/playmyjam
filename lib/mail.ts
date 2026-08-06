// Uygulamanın kendi gönderdiği tek mail türü şu an mekan admininin şifre
// sıfırlama bağlantısı. Müşteri tarafındaki doğrulama/sıfırlama mailleri
// Supabase Auth'tan çıkıyor (SMTP olarak yine Resend bağlı) — oradaki admin
// hesapları Supabase kullanıcısı olmadığı için bu yol ayrı duruyor.
//
// Gönderim Resend'in HTTP API'siyle: Vercel fonksiyonlarında SMTP bağlantısı
// açmaktan hem hızlı hem dertsiz.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const MAIL_FROM = process.env.MAIL_FROM || "PlayMyJam <noreply@playmyjam.com.tr>";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailResult = { ok: true } | { ok: false; error: string };

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[mail] RESEND_API_KEY tanımlı değil, mail gönderilemedi");
    return { ok: false, error: "Mail servisi yapılandırılmamış" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[mail] gönderim başarısız:", res.status, detail.slice(0, 300));
      return { ok: false, error: "Mail gönderilemedi" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[mail] gönderim hatası:", error);
    return { ok: false, error: "Mail gönderilemedi" };
  }
}

// Panelin koyu teması yerine sade bir şablon: mail istemcilerinde koyu zemin +
// özel font sık sık bozuluyor, okunaklılık burada görünüşten önemli.
export function passwordResetEmail(venueName: string, link: string, minutes: number): MailMessage {
  const subject = "PlayMyJam panel şifre sıfırlama";
  const text = [
    `${venueName} paneli için şifre sıfırlama isteği aldık.`,
    "",
    `Yeni şifre belirlemek için: ${link}`,
    "",
    `Bağlantı ${minutes} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
    "Bu isteği siz yapmadıysanız bu maili yok sayabilirsiniz; şifreniz değişmez.",
  ].join("\n");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937;">
  <p style="font-size:20px;font-weight:800;color:#e91e8c;margin:0 0 24px;">PlayMyJam</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
    <strong>${escapeHtml(venueName)}</strong> paneli için şifre sıfırlama isteği aldık.
  </p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#e91e8c;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">
      Yeni şifre belirle
    </a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 8px;">
    Bağlantı ${minutes} dakika geçerlidir ve yalnızca bir kez kullanılabilir.
  </p>
  <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 16px;">
    Bu isteği siz yapmadıysanız bu maili yok sayabilirsiniz; şifreniz değişmez.
  </p>
  <p style="font-size:12px;line-height:1.6;color:#9ca3af;margin:0;word-break:break-all;">
    Buton çalışmazsa: ${link}
  </p>
</div>`.trim();

  return { to: "", subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
