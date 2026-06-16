import { createClient } from "@/lib/supabase/server";
import RequestsClient from "./RequestsClient";

export default async function RequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let initialRequests: unknown[] = [];
  if (user) {
    const { data: queueHistory } = await supabase
      .from("queue")
      .select("id, tokens_spent, priority, status, added_at, songs(title, artist, album_cover_url)")
      .eq("user_id", user.id)
      .order("added_at", { ascending: false })
      .limit(20);

    if (queueHistory) {
      type Row = { id: string; tokens_spent: number; priority: boolean; status: string; added_at: string; songs: unknown };
      initialRequests = (queueHistory as unknown as Row[])
        .filter((q) => q.songs)
        .map((q) => ({
          id: q.id,
          status: q.status === "played" ? "Çalındı" : q.status === "queued" ? "Sırada" : q.status,
          requested_at: q.added_at,
          tokens_spent: q.tokens_spent,
          priority: q.priority,
          songs: q.songs as { title: string; artist: string; album_cover_url: string },
        }));
    }
  }

  return <RequestsClient initialRequests={initialRequests as never} />;
}
