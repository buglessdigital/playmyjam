import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";

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
