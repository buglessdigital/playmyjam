import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPayoutSettings, getUnitPrice } from "@/lib/business-server";
import { contractDocuments, documentKindOf, missingContractFields } from "@/lib/contract-template";

// Mekan sözleşme kapısı: mekana gönderilmiş (pending) belge varsa panel kilitli.
//
// Kilit YOKKEN durum 30 sn önbellekte tutulur (proxy her istekte sorar); kilit
// VARKEN önbelleğe alınmaz — onaylandığı an panel açılsın, başka bir fonksiyon
// örneği eski "kilitli" bilgisiyle geri çevirmesin. Yeni gönderilen belge en geç
// 30 sn içinde kilide dönüşür.
const CACHE_TTL_MS = 30_000;
const clearCache = new Map<string, number>();

export async function venueDocumentsPending(venueDbId: string): Promise<boolean> {
  const clearUntil = clearCache.get(venueDbId);
  if (clearUntil && clearUntil > Date.now()) return false;

  const { count, error } = await supabaseAdmin
    .from("venue_documents")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueDbId)
    .eq("status", "pending");

  // Tablo yoksa ya da okunamadıysa paneli kilitleme (fail-open)
  if (error) {
    console.error("[venue-documents] bekleyen belge okunamadı:", error.message);
    return false;
  }
  const pending = (count ?? 0) > 0;
  if (!pending) clearCache.set(venueDbId, Date.now() + CACHE_TTL_MS);
  return pending;
}

// Super admin belge gönderince bu örnekte kilit hemen devreye girsin
export function forgetVenueDocumentState(venueDbId: string): void {
  clearCache.delete(venueDbId);
}

// Onay kanıtı: onaylanan başlık + metnin özeti
export function documentHash(title: string, body: string): string {
  return createHash("sha256").update(`${title}\n\n${body}`, "utf8").digest("hex");
}

export { DOCUMENT_STATUS_META, type VenueDocumentStatus } from "@/lib/venue-documents-meta";

// Sözleşme koşullarından belge setini (lib/contract-template.ts) üretip mekana
// onaya gönderir. Koşullar eksikse hiçbir şey yapmaz, eksikleri döner.
// Her belge türü için:
//   onaylı sürüm güncel metinle aynı → dokunulmaz (bekleyen eski sürüm geri çekilir)
//   bekleyen / taslak sürüm var       → metni güncellenir, bekliyor durumuna alınır
//   hiç yok ya da onaylı olan eskidi  → yeni belge gönderilir; eski onaylı sürüm,
//                                       yenisi onaylanınca geri çekilir (accept route'u)
export type DocumentSyncResult = { missing: string[]; sent: number; updated: number; unchanged: number };

export async function syncVenueDocuments(venueId: string): Promise<DocumentSyncResult> {
  const [venue, contract, docs, settings, unitPrice] = await Promise.all([
    supabaseAdmin.from("venues").select("name").eq("id", venueId).maybeSingle(),
    supabaseAdmin.from("venue_contracts").select("*").eq("venue_id", venueId).maybeSingle(),
    supabaseAdmin
      .from("venue_documents")
      .select("id, title, body, status, created_at")
      .eq("venue_id", venueId)
      .neq("status", "withdrawn")
      .order("created_at", { ascending: false }),
    getPayoutSettings(),
    getUnitPrice(),
  ]);
  if (venue.error || contract.error || docs.error || !venue.data) {
    throw new Error("Belgeler için mekan bilgisi okunamadı");
  }

  const result: DocumentSyncResult = { missing: missingContractFields(contract.data), sent: 0, updated: 0, unchanged: 0 };
  if (result.missing.length > 0) return result;

  const generated = contractDocuments({ venueName: venue.data.name, contract: contract.data, settings, unitPrice });
  const now = new Date().toISOString();

  for (const g of generated) {
    const mine = docs.data.filter((d) => documentKindOf(d.title) === g.kind);
    const same = (d: { title: string; body: string }) => d.title === g.title && d.body === g.body;
    const accepted = mine.find((d) => d.status === "accepted");
    const open = mine.find((d) => d.status === "pending") ?? mine.find((d) => d.status === "draft");

    if (accepted && same(accepted)) {
      // Koşullar onaylı hâline döndü: bekleyen farklı sürüm artık gereksiz
      if (open?.status === "pending") {
        await supabaseAdmin
          .from("venue_documents")
          .update({ status: "withdrawn", withdrawn_at: now, updated_at: now })
          .eq("id", open.id)
          .eq("status", "pending");
      }
      result.unchanged++;
      continue;
    }

    if (open) {
      if (open.status === "pending" && same(open)) {
        result.unchanged++;
        continue;
      }
      const { data, error } = await supabaseAdmin
        .from("venue_documents")
        .update({
          title: g.title,
          body: g.body,
          status: "pending",
          ...(open.status === "draft" ? { sent_at: now } : {}),
          updated_at: now,
        })
        .eq("id", open.id)
        .eq("status", open.status)
        .select("id")
        .maybeSingle();
      if (error) throw new Error("Belge güncellenemedi");
      // Bu arada onaylandıysa yeni sürümü ayrıca gönder
      if (data) {
        result.updated++;
        continue;
      }
    }

    const { error } = await supabaseAdmin
      .from("venue_documents")
      .insert({ venue_id: venueId, title: g.title, body: g.body, status: "pending", sent_at: now });
    if (error) throw new Error("Belge oluşturulamadı");
    result.sent++;
  }

  if (result.sent + result.updated > 0) forgetVenueDocumentState(venueId);
  return result;
}

// Yeni sürüm onaylanınca aynı türün eski onaylı sürümü geçersiz olur
export async function retireOlderAccepted(venueId: string, acceptedId: string, title: string): Promise<void> {
  const kind = documentKindOf(title);
  if (!kind) return;
  const { data } = await supabaseAdmin
    .from("venue_documents")
    .select("id, title")
    .eq("venue_id", venueId)
    .eq("status", "accepted")
    .neq("id", acceptedId);
  const older = (data ?? []).filter((d) => documentKindOf(d.title) === kind).map((d) => d.id);
  if (older.length === 0) return;
  const now = new Date().toISOString();
  await supabaseAdmin.from("venue_documents").update({ status: "withdrawn", withdrawn_at: now, updated_at: now }).in("id", older);
}
