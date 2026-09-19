import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSuperSession } from "@/lib/session";
import { optionalDay, optionalNumber, text, UUID_RE } from "@/lib/business-server";
import { syncVenueDocuments, type DocumentSyncResult } from "@/lib/venue-documents";

const TEXT_FIELDS: Record<string, number> = {
  legal_name: 200,
  tax_office: 80,
  tax_number: 20,
  account_holder: 200,
  billing_email: 160,
  contact_name: 120,
  contact_phone: 40,
  notes: 4000,
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ venueId: string }> }) {
  if (!getSuperSession(req)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { venueId } = await params;
  if (!UUID_RE.test(venueId)) return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const row: Record<string, unknown> = { venue_id: venueId, updated_at: new Date().toISOString() };

  const commission = optionalNumber(body.commission_pct, 0, 100);
  if (commission === undefined || commission === null) {
    return NextResponse.json({ error: "Komisyon oranı 0-100 arasında olmalı" }, { status: 400 });
  }
  row.commission_pct = Math.round(commission * 100) / 100;

  const paymentDay = optionalNumber(body.payment_day, 1, 28);
  if (paymentDay === undefined || paymentDay === null || !Number.isInteger(paymentDay)) {
    return NextResponse.json({ error: "Ödeme günü 1-28 arasında olmalı" }, { status: 400 });
  }
  row.payment_day = paymentDay;

  for (const key of ["start_date", "end_date"]) {
    const d = optionalDay(body[key]);
    if (d === undefined) return NextResponse.json({ error: "Geçersiz sözleşme tarihi" }, { status: 400 });
    row[key] = d;
  }
  if (row.start_date && row.end_date && (row.end_date as string) < (row.start_date as string)) {
    return NextResponse.json({ error: "Bitiş tarihi başlangıçtan önce olamaz" }, { status: 400 });
  }

  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    const v = text(body[key], max);
    if (v === null) return NextResponse.json({ error: `${key} en fazla ${max} karakter olabilir` }, { status: 400 });
    row[key] = v;
  }

  // IBAN boşluksuz ve büyük harfle saklanır; TR IBAN'ı 26 karakter
  const iban = text(body.iban, 40);
  if (iban === null) return NextResponse.json({ error: "Geçersiz IBAN" }, { status: 400 });
  const cleanIban = iban.replace(/\s+/g, "").toUpperCase();
  if (cleanIban && !/^TR\d{24}$/.test(cleanIban)) {
    return NextResponse.json({ error: "IBAN TR ile başlayan 26 karakter olmalı" }, { status: 400 });
  }
  row.iban = cleanIban;

  const { data: venue } = await supabaseAdmin.from("venues").select("id").eq("id", venueId).maybeSingle();
  if (!venue) return NextResponse.json({ error: "Mekan bulunamadı" }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("venue_contracts")
    .upsert(row, { onConflict: "venue_id" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "Sözleşme kaydedilemedi" }, { status: 500 });

  // Koşullar eksiksizse belge seti üretilip mekana onaya gider
  let documents: DocumentSyncResult | { error: string };
  try {
    documents = await syncVenueDocuments(venueId);
  } catch (e) {
    documents = { error: e instanceof Error ? e.message : "Belgeler oluşturulamadı" };
  }

  return NextResponse.json({ contract: data, documents });
}
