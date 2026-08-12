import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminSession } from "@/lib/admin-session";
import { resolveRequest } from "@/lib/request-resolve";

export async function PATCH(req: NextRequest) {
  const session = await getVerifiedAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requestId = typeof body?.request_id === "string" ? body.request_id : "";
  const status = body?.status;
  if (!requestId || (status !== "accepted" && status !== "rejected")) {
    return NextResponse.json({ error: "Eksik veya geçersiz alan" }, { status: 400 });
  }

  return resolveRequest(session.venue_id, requestId, status);
}
