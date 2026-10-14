import { NextRequest, NextResponse } from "next/server";
import { reconcilePendingPayments } from "@/lib/payment-reconcile";
import { reportIssue } from "@/lib/ops-log";

// 15 dakikada bir: iyzico dönüşü gelmeyen siparişleri kapatır, ödenmişse
// jetonu yükler — bkz. lib/payment-reconcile.ts
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await reconcilePendingPayments();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    await reportIssue({
      area: "cron",
      kind: "payment_reconcile_failed",
      severity: "error",
      message: "Ödeme mutabakatı çöktü — dönüşü gelmeyen ödemeler bu turda kontrol edilmedi",
      error: err,
    });
    return NextResponse.json({ error: err instanceof Error ? err.message : "reconcile failed" }, { status: 500 });
  }
}
