import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { verifyRequestActionToken } from "@/lib/session";
import { resolveRequest } from "@/lib/request-resolve";

// Bildirim üstünden onay/ret. İki yetki yolu var, biri yeterli:
//   1. İmzalı jeton (push yükünde gelir) — service worker sayfa açmadan çağırır.
//      Jeton tek bir talebi kapsar ve talebin karar süresi kadar (10 dk) yaşar.
//   2. Admin oturum çerezi — panel içinden yapılan çağrılar (ör. iOS'ta bildirime
//      dokunup açılan onay ekranı).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const token = typeof body?.token === "string" ? body.token : "";
  const requestIdInput = typeof body?.request_id === "string" ? body.request_id : "";

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  }

  const payload = verifyRequestActionToken(token);
  let venueId = payload?.venue_id ?? "";
  let requestId = payload?.request_id ?? "";

  if (!payload) {
    // Jeton yok/süresi dolmuş — oturum çerezine düş
    const session = await getVerifiedAdminSession(req);
    if (!session || !requestIdInput) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
    venueId = session.venue_id;
    requestId = requestIdInput;
  }

  return resolveRequest(venueId, requestId, action === "approve" ? "accepted" : "rejected");
}
