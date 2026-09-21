import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { consumeRateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Menü PDF'i cihazdan yüklenir: dosya Supabase Storage'daki public bucket'a
 * gider, dönen adres menü satırının değeri olur.
 *
 * Yalnızca PDF: public URL üzerinden servis edilen HTML/SVG script taşıyabilir.
 * Bucket ilk yüklemede kod tarafından açılır (logo akışıyla aynı desen), ayrı
 * bir SQL ya da panel adımı gerekmez.
 */

const BUCKET = "venue-menus";
const MAX_BYTES = 10 * 1024 * 1024;

async function ensureBucket(): Promise<string | null> {
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });
  // Zaten varsa sorun değil
  if (error && !/exist/i.test(error.message)) return error.message;
  return null;
}

// Eski menüler birikmesin: mekanın klasöründeki diğer dosyalar silinir
async function removeOthers(venueId: string, keep: string) {
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(venueId);
  const stale = (data ?? []).map((f) => `${venueId}/${f.name}`).filter((p) => p !== keep);
  if (stale.length > 0) await supabaseAdmin.storage.from(BUCKET).remove(stale);
}

export async function POST(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const limit = await consumeRateLimit(`hub-menu:${session.venue_id}`, 20, 60 * 10);
  if (!limit.allowed) {
    return tooManyRequests(limit.retryAfter, "Çok fazla yükleme denemesi, biraz sonra tekrar deneyin");
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Yalnızca PDF yükleyebilirsiniz" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Menü en fazla 10 MB olabilir" }, { status: 400 });
  }

  const bucketError = await ensureBucket();
  if (bucketError) {
    console.error("[hub-menu] bucket hazırlanamadı:", bucketError);
    return NextResponse.json({ error: "Depolama hazırlanamadı, tekrar deneyin" }, { status: 500 });
  }

  const path = `${session.venue_id}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: "application/pdf", cacheControl: "3600" });

  if (uploadError) {
    console.error("[hub-menu] yüklenemedi:", uploadError.message);
    return NextResponse.json({ error: "Menü yüklenemedi, tekrar deneyin" }, { status: 500 });
  }

  await removeOthers(session.venue_id, path);

  // Adres satırın değerine yazılır; kalıcı olması için mekanın "Kaydet"
  // demesi gerekir (kaydedilmezse dosya bir sonraki yüklemede temizlenir).
  return NextResponse.json({
    url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
  });
}
