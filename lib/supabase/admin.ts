import { createClient } from "@supabase/supabase-js";
import { currentActor } from "@/lib/actor";

// İsteği yapan aktör (bkz. lib/actor.ts) her çağrıya başlık olarak eklenir;
// kuyruk tetikleyicisi değişikliği kimin yaptığını buradan öğrenir.
const actorFetch: typeof fetch = (input, init) => {
  const actor = currentActor();
  if (!actor) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set("x-pmj-actor", actor);
  return fetch(input, { ...init, headers });
};

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: actorFetch } }
);
