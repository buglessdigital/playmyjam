import { createClient } from "@/lib/supabase/server";
import FavoritesClient from "./FavoritesClient";

export default async function FavoritesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let initialFavorites: unknown[] = [];
  if (user) {
    const { data } = await supabase
      .from("user_favorites")
      .select("id, song_id, songs(title, artist, album_cover_url)")
      .eq("user_id", user.id);
    initialFavorites = data ?? [];
  }

  return <FavoritesClient initialFavorites={initialFavorites as never} />;
}
