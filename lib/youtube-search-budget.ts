import { supabaseAdmin } from "@/lib/supabase/admin";

// Talep onayı için yapılan YouTube aramasının (search.list, 100 birim) günlük
// bütçesi. Kota günü 10.000 birim ve Pasifik gece yarısı sıfırlanır; aynı
// kotayı catalog-new cron'u (≤3.000), metadata tazeleme (≤1.500) ve playlist
// senkronu (~1.010) paylaşıyor — ikisi de kota gününün SONUNDA koşuyor, yani
// talepler gündüz kotayı bitirirse onlar aç kalır. Tavan bu yüzden var.
//
// Durum app_settings'te tek satır (migration yok): { day, count, exhausted }.
// Sayaç oku-yaz, atomik değil — eşzamanlı iki talep tavanı 1 aşabilir, sorun değil.

const KEY = "youtube_search_usage";

/** Günde en fazla bu kadar arama (×100 birim). Varsayılan 30 = 3.000 birim. */
const DAILY_CAP = Math.max(0, Number(process.env.YOUTUBE_SEARCH_DAILY_CAP ?? 30) || 0);

type Usage = { day: string; count: number; exhausted: boolean };

/** YouTube kota günü: Pasifik saatiyle tarih (YYYY-MM-DD) */
function quotaDay(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

async function readUsage(): Promise<Usage> {
  const today = quotaDay();
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  const v = data?.value as Partial<Usage> | undefined;
  if (!v || v.day !== today) return { day: today, count: 0, exhausted: false };
  return { day: today, count: Number(v.count ?? 0), exhausted: v.exhausted === true };
}

async function writeUsage(u: Usage): Promise<void> {
  await supabaseAdmin
    .from("app_settings")
    .upsert({ key: KEY, value: u, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Bugün arama yapılabilir mi? Okuma hatasında false — bağlantı yapıştırma akışı her zaman çalışır. */
export async function canSearchYouTube(): Promise<boolean> {
  if (DAILY_CAP === 0) return false;
  try {
    const u = await readUsage();
    return !u.exhausted && u.count < DAILY_CAP;
  } catch {
    return false;
  }
}

/** Yapılan bir aramayı sayar (yanıt gelmese de birim düşmüş sayılır). */
export async function recordYouTubeSearch(): Promise<void> {
  try {
    const u = await readUsage();
    await writeUsage({ ...u, count: u.count + 1 });
  } catch {
    // sayaç yazılamadıysa tavan biraz gevşer; akış durmaz
  }
}

/** Google 403 "quota" döndü: kota gününün sonuna kadar arama kapanır. */
export async function markYouTubeQuotaExhausted(): Promise<void> {
  try {
    const u = await readUsage();
    await writeUsage({ ...u, exhausted: true });
  } catch {
    // yazılamazsa bir sonraki arama yine 403 alır ve tekrar dener
  }
}
