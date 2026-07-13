import HistoryClient from "./HistoryClient";

// Statik kabuk — geçmiş client'ta tek RPC ile gelir (tüm mekanlar, RLS korumalı).
// runtime prefetch: üstteki venue layout'u params okuduğu için doğrulama örnek ister.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

export default function HistoryPage() {
  return <HistoryClient />;
}
