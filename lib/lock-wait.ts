// Panel komutlarının kilit bekleme ve "son komut kazanır" kararları — saf
// (importsuz), testi lib/lock-wait.test.ts. DB çağrıları dışarıdan verilir
// (bkz. lib/queue-lock.ts runSingleFlightWaiting).

export type AcquireAttempt = "acquired" | "busy" | "error";
export type AcquireOutcome = "acquired" | "error" | "timeout";

/**
 * Kilidi alana kadar dener. "busy" dönerse BEKLER — çekilmez. Komut kaybetmek
 * (17 Eki 2026: "listeyi devral" kilit doluyken sessizce düştü) sıra
 * karışmasının ta kendisidir.
 */
export async function acquireOrWait(
  tryAcquire: () => Promise<AcquireAttempt>,
  options: {
    maxWaitMs: number;
    stepMs: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<AcquireOutcome> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = now() + options.maxWaitMs;
  for (;;) {
    const attempt = await tryAcquire();
    if (attempt !== "busy") return attempt;
    if (now() >= deadline) return "timeout";
    await sleep(options.stepMs);
  }
}

/**
 * Ertelenen komut uygulanmalı mı? Damga hâlâ bu komuttaysa evet. Damga
 * okunamadıysa (latest undefined) ya da komutun damgası yoksa yine evet: komut
 * kaybetmek, sıranın karışma ihtimalinden daha kötüdür.
 */
export function shouldApplyIntent(latest: string | null | undefined, token: string | undefined): boolean {
  if (!token || latest === undefined || latest === null) return true;
  return latest === token;
}
