import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  adminGoogleLinkPending,
  forgetAdminState,
  getVerifiedAdminSession,
} from "@/lib/admin-session";

// Mekan admini panelden "Google ile bağla" dediğinde Google buraya döner.
//
// Buradaki Supabase oturumu yalnızca kimliği doğrulamak için açılır: e-posta ve
// değişmeyen hesap kimliği (sub) alınıp venue_admins satırına yazılır, ardından
// oturum kapatılır. Admin paneline erişim eskisi gibi imzalı admin çerezinden
// gelir — Google, panelin giriş yöntemi değil, kurtarma adresidir.
//
// Google'dan dönüş üst düzey bir GET gezinmesi olduğu için SameSite=Lax olan
// admin çerezi bu istekte de gelir; kimin bağladığını oradan biliyoruz.

// Bağlama iki yerden başlayabiliyor: ayarlar sayfasındaki kart (isteğe bağlı) ve
// yeni mekanların önüne çıkan zorunlu bağlama ekranı. Hata mesajı hangisinden
// gelindiyse oraya dönmeli — zorunlu akışta ayarlar sayfası zaten kilitli.
function resultUrl(
  origin: string,
  slug: string,
  pending: boolean,
  param: string,
  value: string
): URL {
  const url = new URL(pending ? `/admin/${slug}/link-google` : `/admin/${slug}/settings`, origin);
  url.searchParams.set(param, value);
  return url;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;

  const session = await getVerifiedAdminSession(req, { allowPendingGoogleLink: true });
  if (!session) {
    // Bağlama sırasında admin oturumu düşmüş; hangi mekan olduğunu artık
    // bilmiyoruz (mekan kimliği yalnızca o çerezde), ana sayfaya al
    return NextResponse.redirect(new URL("/", origin));
  }

  const slug = session.venue_slug;
  // Zorunlu akışta mıyız? Satır birazdan güncelleneceği için ŞİMDİ okunmalı
  const pending = await adminGoogleLinkPending(session.admin_id);
  const fail = (value: string) =>
    NextResponse.redirect(resultUrl(origin, slug, pending, "google_error", value));

  const code = searchParams.get("code");
  if (!code) {
    const reason = searchParams.get("error_description") || searchParams.get("error");
    return fail(reason ? "denied" : "missing_code");
  }

  // Tek-response deseni: Supabase'in yazdığı çerezler dönen yanıta işlensin.
  // Zorunlu akış bitince panelin ana ekranı açılır.
  const response = NextResponse.redirect(
    pending
      ? new URL(`/admin/${slug}`, origin)
      : resultUrl(origin, slug, false, "google", "linked")
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return fail("oauth_failed");
  }

  const user = data.session.user;
  const email = user.email?.trim().toLowerCase() ?? "";
  const googleIdentity = user.identities?.find((identity) => identity.provider === "google");
  const sub = googleIdentity?.id ?? (typeof user.user_metadata?.sub === "string" ? user.user_metadata.sub : "");

  // Supabase oturumu işi bitti: yalnızca bu tarayıcıdaki oturumu kapat
  // (scope: "global" adminin telefonundaki müşteri oturumunu da düşürürdü)
  await supabase.auth.signOut({ scope: "local" });

  if (!email || !sub) {
    return fail("no_email");
  }

  // Aynı Google hesabı başka bir mekanın adminine bağlıysa devral etme:
  // sıfırlama bağlantısının hangi panele ait olduğu belirsizleşir
  const { data: existing } = await supabaseAdmin
    .from("venue_admins")
    .select("id")
    .eq("google_sub", sub)
    .maybeSingle();

  if (existing && existing.id !== session.admin_id) {
    return fail("in_use");
  }

  const { error: updateError } = await supabaseAdmin
    .from("venue_admins")
    .update({
      google_email: email,
      google_sub: sub,
      google_linked_at: new Date().toISOString(),
      google_link_required: false,
    })
    .eq("id", session.admin_id);

  if (updateError) {
    console.error("[admin-google] hesap bağlanamadı:", updateError.message);
    return fail("save_failed");
  }

  // Kilit bir sonraki istekte değil, hemen kalksın
  forgetAdminState(session.admin_id);

  return response;
}
