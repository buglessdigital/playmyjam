import RequestsClient from "./RequestsClient";

// Statik kabuk — istek geçmişi client'ta tek sorguyla gelir (RLS korumalı).
// runtime prefetch: üstteki venue layout'u params okuduğu için doğrulama örnek ister.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

export default function RequestsPage() {
  return <RequestsClient />;
}
