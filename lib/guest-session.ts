"use client";

import { createClient } from "@/lib/supabase/client";

// Misafir oturumu: müşteri şarkı eklemek için giriş ekranından geçmez. İlk
// hesap gerektiren dokunuşta Supabase anonymous sign-in ile sessizce bir kimlik
// açılır ve mekan çerezi kurulur — akıştan iki dokunuş (Google düğmesi + hesap
// seçimi) ve bir ekran düşer.
//
// Kimlik gerçek bir auth.users satırıdır: cüzdan, kuyruk kaydı, RLS ve ödeme
// tarafında hiçbir şey değişmez. E-posta/Google bağlama isteğe bağlı hâle gelir
// (profil menüsü) ve başka cihaza geçmek isteyene lazım olur.
//
// Panelde "Anonymous sign-ins" kapalıysa signInAnonymously hata döner; o durumda
// false dönülür ve çağıran eski yola, giriş ekranına düşer. Yani bu dosya açık
// olmayan bir ortamda akışı bozmaz, sadece hiçbir şey kazandırmaz.

let inFlight: Promise<boolean> | null = null;

/**
 * Bu mekanda kullanılabilir bir oturum olduğundan emin olur.
 * - Oturum zaten varsa (başka mekandan gelen kullanıcı dahil) yalnızca mekan
 *   çerezi kurulur: aynı kişi için "devam et" düğmesine bastırmanın anlamı yok.
 * - Oturum yoksa misafir kimliği açılır.
 * Dönüş: true = artık hesap var, işleme devam edilebilir.
 */
export function ensureVenueSession(venueId: string): Promise<boolean> {
  // Aynı anda iki düğmeye basılırsa iki anonim hesap açılmasın
  inFlight ??= run(venueId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(venueId: string): Promise<boolean> {
  const supabase = createClient();
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) return false;
    }

    // Mekan çerezini yalnızca sunucu kurabilir (httpOnly)
    const res = await fetch(`/api/venue/${venueId}/auth`, { method: "POST" });
    if (!res.ok) return false;

    // Onaylar: giriş ekranından geçilmediği için kayıt metadata'sı yok. Zorunlu
    // onaylar (KVKK + şartlar) müşterinin bu dokunuşuyla verilmiş sayılır —
    // metin ve bağlantılar ekleme kartında ve sayfa altındaki yasal şeritte.
    // Ticari ileti izni ASLA burada verilmez (6563 s. Kanun): varsayılan kapalı,
    // müşteri isterse ayarlardan açar.
    await stampConsentIfMissing(supabase);
    return true;
  } catch {
    return false;
  }
}

async function stampConsentIfMissing(supabase: ReturnType<typeof createClient>) {
  try {
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("kvkk_consent_at, marketing_consent")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.kvkk_consent_at) return;
    // Mevcut ticari ileti tercihi korunur — record_consents onu p_marketing'e eşitler
    await supabase.rpc("record_consents", { p_marketing: profile.marketing_consent === true });
  } catch {
    // Onay damgası atılamadıysa akış durmaz; damga bir sonraki hesap gerektiren
    // dokunuşta yeniden denenir
  }
}

/** Oturum misafir (anonim) mi — onay metninin gösterileceği yerde kullanılır. */
export async function isGuestAccount(): Promise<boolean> {
  try {
    const { data } = await createClient().auth.getClaims();
    return (data?.claims as { is_anonymous?: boolean } | undefined)?.is_anonymous === true;
  } catch {
    return false;
  }
}
