import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendPushToVenueAdmins } from "@/lib/push";
import { sendMail, escapeHtml } from "@/lib/mail";
import { consumeRateLimit } from "@/lib/rate-limit";
import { reportIssue } from "@/lib/ops-log";
import type { VenueEventInput } from "@/lib/venue-events";

// MÜZİK DURDU ALARMI. Kaynak, player'ın kendi ölçtüğü "kontrol dışı sessizlik"
// (YouTubePlayer trackSilence → silence_start / silence_end): mekan müzik
// isterken 10 sn ses kanıtı yoksa açılır. Panelden duraklatma, cihaz uykusu ve
// çalmanın başka cihaza geçmesi orada zaten ayıklanıyor — burada yeniden
// yorumlanmaz.
//
// Player HİÇ sinyal vermeden kaybolursa (elektrik, internet, kapak) alarm
// YOK — 15 Eki 2026 kararı: mekanlar kapanışta player'ı kapatmadan bilgisayarı
// kapatıyor (Mezzanine 14 günde 3 açılış, 0 kapanış sinyali), her gece yanlış
// alarm olurdu. Çalışma saati eklenirse bu kör nokta kapatılabilir.
//
// Kanallar: mekan adminlerine push (tag mekana sabit → "yeniden çalıyor"
// bildirimi "durdu"nun üstüne yazar, telefonda yığılmaz), OPS_ALERT_EMAIL'e
// e-posta (mekan başına 30 dk'da bir), Sorunlar ekranı.

const MAIL_WINDOW_SECONDS = 30 * 60;

const END_TEXT: Record<string, { title: string; body: (s: number) => string }> = {
  recovered: { title: "Müzik yeniden çalıyor", body: (s) => `${s} sn süren sessizlik kendiliğinden geçti.` },
  paused: { title: "Müzik duraklatıldı", body: (s) => `${s} sn sessizlikten sonra müzik panelden duraklatıldı.` },
  sleep: { title: "Player'ın cihazı uyudu", body: () => "Player'ın açık olduğu cihaz uykuya geçti ya da kapandı — müzik çalmıyor." },
  closed: { title: "Player kapatıldı", body: () => "Player sekmesi kapatıldı — müzik çalmıyor." },
  handoff: { title: "Çalma başka cihaza geçti", body: () => "Müzik artık başka bir cihazdan çalıyor." },
};

type VenueInfo = { name: string; slug: string };

async function venueInfo(venueId: string): Promise<VenueInfo | null> {
  const { data } = await supabaseAdmin.from("venues").select("name, slug").eq("id", venueId).maybeSingle();
  return data ? { name: (data.name as string) || (data.slug as string), slug: data.slug as string } : null;
}

function silenceId(e: VenueEventInput): string | null {
  const id = e.detail?.silence_id;
  return typeof id === "string" && id ? id : null;
}

/** Player'ın heartbeat/release ile getirdiği olaylardan sessizlik alarmlarını çıkarır. */
export async function handleSilenceAlerts(venueId: string, events: VenueEventInput[]): Promise<void> {
  const starts = events.filter((e) => e.kind === "silence_start" && silenceId(e));
  const ends = events.filter((e) => e.kind === "silence_end" && silenceId(e));
  if (starts.length === 0 && ends.length === 0) return;

  // Aynı partide hem başlayıp hem biten sessizlik (player çevrimdışıyken
  // birikmiş): olay çoktan geçmiş, alarm da sonucu da anlamsız
  const endedIds = new Set(ends.map(silenceId));
  const startedIds = new Set(starts.map(silenceId));

  const venue = await venueInfo(venueId);
  if (!venue) return;
  const url = `/admin/${venue.slug}`;
  const tag = `music-${venueId}`;

  for (const start of starts) {
    const id = silenceId(start)!;
    if (endedIds.has(id)) continue;
    // Yanıt kaybolunca player aynı olayı tekrar yollayabiliyor — alarm bir kez
    const { allowed } = await consumeRateLimit(`music-alert:${id}`, 1, 24 * 60 * 60);
    if (!allowed) continue;

    const queueEmpty = !start.detail?.video_id;
    const title = queueEmpty ? "Sıra boşaldı, müzik durdu" : "Müzik durdu";
    const body = queueEmpty
      ? `${venue.name}: çalacak şarkı kalmadı. Panelden şarkı ekle ya da bir playlist'i aktif et.`
      : `${venue.name}: 10 sn'dir ses yok. Player'ın açık olduğu cihazı ve interneti kontrol et.`;

    await sendPushToVenueAdmins(venueId, { title, body, url, tag }, { kind: "music_stopped" }).catch(() => {});

    await reportIssue({
      area: "player",
      kind: queueEmpty ? "music_stopped_queue_empty" : "music_stopped",
      severity: "warn",
      message: `${venue.name}: ${queueEmpty ? "sıra boşaldı, müzik durdu" : "müzik durdu (10 sn'dir ses yok)"}`,
      venueId,
      detail: { silence_id: id, video_id: start.detail?.video_id ?? null, playing_frozen: start.detail?.playing_frozen ?? null },
    });

    await mailOps(venueId, venue, title, body);
  }

  for (const end of ends) {
    const id = silenceId(end)!;
    if (startedIds.has(id)) continue;
    const endedBy = typeof end.detail?.ended_by === "string" ? end.detail.ended_by : "";
    const text = END_TEXT[endedBy];
    if (!text) continue;
    const seconds = typeof end.detail?.seconds === "number" ? end.detail.seconds : 0;
    await sendPushToVenueAdmins(
      venueId,
      { title: text.title, body: `${venue.name}: ${text.body(seconds)}`, url, tag },
      { kind: "music_resumed" }
    ).catch(() => {});
  }
}

async function mailOps(
  venueId: string,
  venue: VenueInfo,
  title: string,
  body: string,
  rateKey = `music-alert-mail:${venueId}`
) {
  const recipients = (process.env.OPS_ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0) return;
  // Takılma serisi gelen kutusunu doldurmasın: mekan başına yarım saatte bir
  const { allowed } = await consumeRateLimit(rateKey, 1, MAIL_WINDOW_SECONDS);
  if (!allowed) return;

  const health = "https://playmyjam.com.tr/super-admin/health";
  const text = `${body}\n\nSağlık ekranı: ${health}\n(Aynı mekan için 30 dakika boyunca yeni e-posta gönderilmez.)`;
  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937;">
  <p style="font-size:20px;font-weight:800;color:#e91e8c;margin:0 0 24px;">PlayMyJam</p>
  <p style="font-size:16px;font-weight:700;margin:0 0 8px;">${escapeHtml(title)}</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">${escapeHtml(body)}</p>
  <p style="margin:0 0 20px;"><a href="${health}" style="color:#e91e8c;font-weight:600;">Sağlık ekranını aç</a></p>
  <p style="font-size:12px;color:#9ca3af;margin:0;">Aynı mekan için 30 dakika boyunca yeni e-posta gönderilmez.</p>
</div>`.trim();

  for (const to of recipients) {
    await sendMail({ to, subject: `[PMJ] ${venue.name}: ${title}`, html, text });
  }
}

/**
 * SIRA / KOMUT ALARMI: müzik çalıyor ama mekan sahibinin belirlediği sıradan
 * sapıldı ya da panel komutu uygulanamadı. Sessizlik alarmı bunları görmez;
 * 17 Eki 2026'da yanlış listeden çalma ve silinen şarkılar hiçbir alarma
 * düşmedi. OPS_ALERT_EMAIL'e gider (mekan + tür başına 30 dk'da bir); Sorunlar
 * kaydını çağıran taraf ayrıca yazar.
 */
export async function alertOrderProblem(venueId: string, kind: string, title: string, body: string): Promise<void> {
  try {
    const venue = await venueInfo(venueId);
    if (!venue) return;
    await mailOps(venueId, venue, title, `${venue.name}: ${body}`, `order-alert-mail:${venueId}:${kind}`);
  } catch (err) {
    console.error("[music-alert] sıra alarmı gönderilemedi:", err);
  }
}
