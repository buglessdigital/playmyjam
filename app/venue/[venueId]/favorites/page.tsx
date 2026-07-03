import FavoritesClient from "./FavoritesClient";

// Statik kabuk — favoriler client'ta tek sorguyla gelir (RLS korumalı).
// runtime prefetch: üstteki venue layout'u params okuduğu için doğrulama örnek ister.
export const unstable_instant = {
  prefetch: "runtime",
  samples: [{ params: { venueId: "ecem-s-house" } }],
};

export default function FavoritesPage() {
  return <FavoritesClient />;
}
