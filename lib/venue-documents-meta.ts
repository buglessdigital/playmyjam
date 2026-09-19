// Sözleşme belgesi durumları — istemci ve sunucu ortak (node:crypto içermez).

export type VenueDocumentStatus = "draft" | "pending" | "accepted" | "withdrawn";

export const DOCUMENT_STATUS_META: Record<VenueDocumentStatus, { label: string; color: string }> = {
  draft: { label: "Taslak", color: "#9ca3af" },
  pending: { label: "Onay bekliyor", color: "#f59e0b" },
  accepted: { label: "Onaylandı", color: "#22c55e" },
  withdrawn: { label: "Geri çekildi", color: "#ef4444" },
};
