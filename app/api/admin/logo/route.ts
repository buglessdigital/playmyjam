import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { getSuperSession } from "@/lib/session";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Mekan logosu cihazdan yüklenir: dosya Supabase Storage'daki public bucket'a
// gider, venues.logo_url oraya işaret eder. SVG kabul edilmiyor — public URL
// üzerinden servis edilen SVG script taşıyabilir.
const BUCKET = "venue-logos";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

type Target = { venueId: string; venueSlug: string };

// Mekan admini kendi mekanına, super admin ?venue=<slug> ile herhangi birine yükler
async function resolveTarget(req: NextRequest): Promise<Target | null> {
  const admin = await getVerifiedAdminSession(req);
  if (admin) return { venueId: admin.venue_id, venueSlug: admin.venue_slug };

  if (!getSuperSession(req)) return null;
  const slug = req.nextUrl.searchParams.get("venue")?.trim();
  if (!slug) return null;

  const { data } = await supabaseAdmin.from("venues").select("id, slug").eq("slug", slug).single();
  return data ? { venueId: data.id, venueSlug: data.slug } : null;
}

// Bucket ilk yüklemede oluşturulur; ayrıca SQL/panel adımı gerekmesin diye.
async function ensureBucket(): Promise<string | null> {
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: Object.keys(TYPES),
  });
  // Zaten varsa sorun değil
  if (error && !/exist/i.test(error.message)) return error.message;
  return null;
}

// Eski logolar birikmesin: mekanın klasöründeki diğer dosyalar silinir
async function removeOthers(venueId: string, keep: string) {
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(venueId);
  const stale = (data ?? []).map((f) => `${venueId}/${f.name}`).filter((p) => p !== keep);
  if (stale.length > 0) await supabaseAdmin.storage.from(BUCKET).remove(stale);
}

function saveLogoUrl(target: Target, logoUrl: string) {
  revalidateTag(`venue-${target.venueSlug}`, "max");
  revalidateTag("venues-list", "max");
  return supabaseAdmin.from("venues").update({ logo_url: logoUrl }).eq("id", target.venueId);
}

export async function POST(req: NextRequest) {
  const target = await resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const limit = await consumeRateLimit(`logo:${target.venueId}`, 20, 60 * 10);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfter, "Çok fazla yükleme denemesi, biraz sonra tekrar deneyin");
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
  }

  const ext = TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Yalnızca PNG, JPG, WEBP veya GIF yükleyebilirsiniz" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Logo en fazla 2 MB olabilir" }, { status: 400 });
  }

  const bucketError = await ensureBucket();
  if (bucketError) {
    console.error("[logo] bucket hazırlanamadı:", bucketError);
    return NextResponse.json({ error: "Depolama hazırlanamadı, tekrar deneyin" }, { status: 500 });
  }

  const path = `${target.venueId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, cacheControl: "31536000" });

  if (uploadError) {
    console.error("[logo] yüklenemedi:", uploadError.message);
    return NextResponse.json({ error: "Logo yüklenemedi, tekrar deneyin" }, { status: 500 });
  }

  const logoUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: saveError } = await saveLogoUrl(target, logoUrl);
  if (saveError) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  await removeOthers(target.venueId, path);
  return NextResponse.json({ logo_url: logoUrl });
}

export async function DELETE(req: NextRequest) {
  const target = await resolveTarget(req);
  if (!target) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { error } = await saveLogoUrl(target, "");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Depodaki dosya da gitsin (dışarıdan URL girilmişse klasör zaten boştur)
  await removeOthers(target.venueId, "");
  return NextResponse.json({ logo_url: "" });
}
