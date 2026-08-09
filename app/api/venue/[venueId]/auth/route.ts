import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { setVenueAuthCookie, clearVenueAuthCookie } from "@/lib/venue-auth-cookie";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Kayıt metadata'sındaki onayları profile taşır ve eksik olup olmadığını
  // söyler (0043). RPC'nin kendisi patlarsa (migration uygulanmamış olabilir)
  // giriş engellenmez — asıl onay noktası kayıt ekranındaki kutular, buradaki
  // yönlendirme yalnızca emniyet ağı.
  const { data: consentMissing, error: consentError } = await supabase.rpc("claim_signup_consents");

  const res = NextResponse.json({ ok: true, needsConsent: !consentError && consentMissing === true });
  setVenueAuthCookie(res, venueId, user.id);
  return res;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const res = NextResponse.json({ ok: true });
  clearVenueAuthCookie(res, venueId);
  return res;
}
