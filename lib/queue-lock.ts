import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { reportIssue } from "@/lib/ops-log";
import { acquireOrWait, shouldApplyIntent } from "@/lib/lock-wait";

// Kuyruk işlerini mekan başına serileştiren kilit (0046 + 0047).
//
// Postgres advisory lock işe yaramaz: bu işler onlarca HTTP turu sürüyor,
// pg_advisory_xact_lock ise PostgREST'in tek RPC transaction'ıyla biter. Bu
// yüzden DB'de kiralık (lease) satır kilidi kullanılıyor.
//
// İKİ KAPSAM birbirini beklemez:
//   fill    → kuyruk dolumu / liste imleci. Tekrarlanabilir iş.
//   advance → sahnedeki şarkıyı değiştiren her şey. TEKRARLANAMAZ iş.
// Ayrı olmalarının sebebi: uzun süren bir dolum, biten şarkının yerine yenisini
// koymayı bloklarsa müzik susar.
export const FILL_SCOPE = "fill";
export const ADVANCE_SCOPE = "advance";

// Kira süresi. Dolum büyük listelerde birkaç saniye sürebiliyor; 60 sn bol bir
// tavan. Süre dolarsa kilit kendiliğinden serbest kalır.
const LOCK_TTL_SECONDS = 60;

// dirty bayrağı yüzünden atılacak ek tur sayısı. Sonsuz döngü olmasın diye
// sınırlı: istek yağan mekanda birkaç turdan sonra bırakılır, bir sonraki çağrı
// zaten yeniden kilidi alır.
const MAX_PASSES = 4;

async function release(venueId: string, scope: string, holder: string): Promise<void> {
  await supabaseAdmin
    .rpc("release_queue_fill_lock", { p_venue_id: venueId, p_holder: holder, p_scope: scope })
    .then(
      () => {},
      () => {}
    );
}

/**
 * TEKRARLANABİLİR iş (kuyruk dolumu) için tek koşucu.
 *
 * Kilidi alamayan çağrı beklemez: DB tarafında dirty bayrağı kalkar, kilidi
 * tutan iş bitiminde bir tur daha atar. Böylece "araya kuyruk temizleme girdi,
 * dolum atlandı, müzik sustu" hali oluşmaz.
 *
 * KİLİT ARIZASINDA AÇIK KAL: RPC yoksa (migration uygulanmadan deploy) ya da DB
 * hata verirse iş kilitsiz yapılır. Eski davranıştır — yarış ihtimali kalır ama
 * sessizlik olmaz.
 */
export async function runSingleFlight(venueId: string, fn: () => Promise<void>): Promise<void> {
  const holder = randomUUID();
  const { data: acquired, error } = await supabaseAdmin.rpc("try_acquire_queue_fill_lock", {
    p_venue_id: venueId,
    p_holder: holder,
    p_ttl_seconds: LOCK_TTL_SECONDS,
    p_scope: FILL_SCOPE,
    p_mark_dirty: true,
  });

  if (error) {
    await fn();
    return;
  }
  // Kilit başkasında: o iş bitince dirty bayrağı sayesinde bir tur daha atacak.
  if (!acquired) return;

  try {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      await fn();
      const { data: again, error: finishErr } = await supabaseAdmin.rpc("finish_queue_fill", {
        p_venue_id: venueId,
        p_holder: holder,
        p_ttl_seconds: LOCK_TTL_SECONDS,
        p_scope: FILL_SCOPE,
      });
      // false: kilit bırakıldı (ya da kira başkasına geçti) — iş bitti.
      // Hata: kilidi bırakıp çekil, iş bu turda zaten yapıldı.
      if (finishErr || !again) break;
    }
  } finally {
    // Normal çıkışta kilit finish_queue_fill ile zaten bırakıldı; bu çağrı o
    // halde zararsızdır (dirty'ye dokunmaz). Asıl işi iş patladığında görür:
    // kira dolana kadar mekan dolumsuz kalmasın.
    await release(venueId, FILL_SCOPE, holder);
  }
}

// Bekleyen koşucunun yoklama aralığı ve tavanı. Tavan kira süresinden (60 sn)
// uzun: kilidi tutan iş ölse bile kira dolunca bekleyen onu mutlaka devralır.
const WAIT_STEP_MS = 150;
const WAIT_MAX_MS = (LOCK_TTL_SECONDS + 5) * 1000;

/**
 * KAYBOLAMAZ iş (panel komutu: listeyi devral, sırayı değiştir, listeyi sıraya
 * al...) için koşucu. runSingleFlight'tan farkı: kilit doluysa ÇEKİLMEZ, kilit
 * boşalana kadar BEKLER.
 *
 * Neden: runSingleFlight kilidi alamayınca işi atıp yalnızca dirty bayrağı
 * bırakıyordu; kilidi tutan iş bitince bir tur daha atıyor ama kendi işini
 * (dolumu) — bizim komutumuzu değil. 17 Eki 2026 Mezzanine: başka listeden
 * şarkı açıldı, o anda dolum sürdüğü için "listeyi devral" sessizce düştü ve
 * şarkı bitince ESKİ listeden çalmaya devam etti. Kuyruk boşken yapılan dolum da
 * aynı yoldan düşüp "kuyruk boşaldı, müzik durdu" doğuruyordu.
 *
 * first: komutun kendisi, TEK kez koşar (tekrarı zararlı olabilir: listeyi
 *        devralmak ilerlemeyi sıfırlar).
 * repeat: kilidi tutarken gelen dolum isteklerinin karşılığı (dirty) — dolum.
 * maxWaitMs: dolunca iş kilitsiz yapılır ve Sorunlar'a yazılır. Varsayılan kira
 *        süresinin ötesi: o noktada kilit zaten devralınabilir olmalı.
 */
export async function runSingleFlightWaiting(
  venueId: string,
  first: () => Promise<void>,
  repeat: () => Promise<void>,
  options: { label: string; maxWaitMs?: number }
): Promise<void> {
  const holder = randomUUID();
  const maxWaitMs = options.maxWaitMs ?? WAIT_MAX_MS;
  const outcome = await acquireOrWait(
    async () => {
      const { data: acquired, error } = await supabaseAdmin.rpc("try_acquire_queue_fill_lock", {
        p_venue_id: venueId,
        p_holder: holder,
        p_ttl_seconds: LOCK_TTL_SECONDS,
        p_scope: FILL_SCOPE,
        // Bekleyen çağrı iz bırakmaz: kilidi alınca kendi dolumunu zaten yapacak
        p_mark_dirty: false,
      });
      return error ? "error" : acquired ? "acquired" : "busy";
    },
    { maxWaitMs, stepMs: WAIT_STEP_MS }
  );

  // Kilit arızası: iş kilitsiz yapılır (runSingleFlight ile aynı ilke)
  if (outcome === "error") {
    await first();
    return;
  }
  if (outcome === "timeout") {
    await reportIssue({
      area: "queue",
      kind: "lock_wait_timeout",
      severity: "error",
      message: `Kuyruk kilidi ${Math.round(maxWaitMs / 1000)} sn boşalmadı — "${options.label}" kilitsiz uygulandı`,
      venueId,
      detail: { label: options.label },
    });
    await first();
    return;
  }

  try {
    await first();
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const { data: again, error: finishErr } = await supabaseAdmin.rpc("finish_queue_fill", {
        p_venue_id: venueId,
        p_holder: holder,
        p_ttl_seconds: LOCK_TTL_SECONDS,
        p_scope: FILL_SCOPE,
      });
      if (finishErr || !again) break;
      await repeat();
    }
  } finally {
    await release(venueId, FILL_SCOPE, holder);
  }
}

// --- EN SON PANEL KOMUTU -----------------------------------------------------
// Komutlar artık beklediği için sıraları karışabilir: art arda iki "şu listeden
// çal" tıklamasında, bekleyen ikinci iş birinciden önce kilidi kapabilir ve
// sonra birincisi listeyi geri çevirir — mekan sahibinin SON tıkladığı liste
// kaybeder. Sahne değişimi (playSongNow) sahne kilidi altında sıralı olduğu için
// komutun damgası orada atılır; ertelenen kuyruk işi uygulanmadan önce damganın
// hâlâ kendisinde olduğunu doğrular, değilse daha yeni bir komut onu geçmiştir.
//
// Ayrı tablo yok: kilit tablosunun (venue_id, scope) anahtarına 'intent'
// kapsamıyla tek satır yazılır. Bu kapsam hiçbir zaman kilit olarak alınmaz.
const INTENT_SCOPE = "intent";

export async function markLatestIntent(venueId: string): Promise<string> {
  const token = randomUUID();
  const { error } = await supabaseAdmin.from("queue_fill_locks").upsert(
    { venue_id: venueId, scope: INTENT_SCOPE, holder: token, locked_until: new Date().toISOString(), dirty: false },
    { onConflict: "venue_id,scope" }
  );
  if (error) console.error("[queue-lock] komut damgası yazılamadı:", error.message);
  return token;
}

/** Damga okunamazsa komut uygulanır: komut kaybetmek sıra karışmasından kötü. */
export async function isLatestIntent(venueId: string, token: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("queue_fill_locks")
    .select("holder")
    .eq("venue_id", venueId)
    .eq("scope", INTENT_SCOPE)
    .maybeSingle();
  return shouldApplyIntent(error ? undefined : (data?.holder as string | null | undefined), token);
}

/**
 * TEKRARLANAMAZ iş (sahnedeki şarkıyı değiştirmek) için tek koşucu.
 *
 * dirty YOK, tekrar turu YOK: kilidi alamayan çağrı `busy` değerini döndürüp
 * hiçbir şey yapmadan çekilir. İkinci çağrı zaten gereksizdir — tekrarlanırsa
 * yeni sahneye çıkmış şarkı hiç çalmadan 'played' olur.
 *
 * Kilit arızasında (RPC yok / DB hatası) iş kilitsiz yapılır: koruma kaybolur
 * ama müzik durmaz.
 */
export async function runExclusive<T>(
  venueId: string,
  fn: () => Promise<T>,
  busy: () => T
): Promise<T> {
  const holder = randomUUID();
  const { data: acquired, error } = await supabaseAdmin.rpc("try_acquire_queue_fill_lock", {
    p_venue_id: venueId,
    p_holder: holder,
    p_ttl_seconds: LOCK_TTL_SECONDS,
    p_scope: ADVANCE_SCOPE,
    p_mark_dirty: false,
  });

  if (error) return fn();
  if (!acquired) return busy();

  try {
    return await fn();
  } finally {
    await release(venueId, ADVANCE_SCOPE, holder);
  }
}
