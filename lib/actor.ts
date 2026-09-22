import { AsyncLocalStorage } from "node:async_hooks";

// Veritabanındaki değişikliği KİMİN yaptığı. Route başında withActor ile verilir;
// o isteğin (ve başlattığı fire-and-forget işlerin) bütün supabaseAdmin
// çağrılarına `x-pmj-actor` başlığı olarak eklenir (bkz. lib/supabase/admin.ts).
// PostgREST başlıkları `request.headers` ayarına koyar; kuyruk tetikleyicisi
// (0055 log_queue_event) oradan okuyup olayı kimin yaptığıyla kaydeder.
//
// "admin-" ile başlayanlar mekanın BİLEREK yaptığı işlerdir: sağlık kayıtları
// bunları uyarı saymaz (ör. admin'in müşteri isteğini silmesi).
const store = new AsyncLocalStorage<string>();

export function withActor<T>(actor: string, fn: () => T): T {
  return store.run(actor, fn);
}

export function currentActor(): string | undefined {
  return store.getStore();
}
