"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type FavSong = {
  id: string;
  song_id: string;
  songs: { title: string; artist: string; album_cover_url: string };
};

export default function FavoritesClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loaded, setLoaded] = useState(false);
  const [favorites, setFavorites] = useState<FavSong[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Kullanıcı id'si lokal session'dan (ağ çağrısı yok); favoriler tek sorgu
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (cancelled || !userId) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("user_favorites")
        .select("id, song_id, songs(title, artist, album_cover_url)")
        .eq("user_id", userId);
      if (!cancelled) {
        setFavorites((data ?? []) as unknown as FavSong[]);
        setLoaded(true);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const removeFavorite = async (favId: string) => {
    // Optimistic: satırı hemen kaldır, hata olursa geri koy
    const removed = favorites.find((f) => f.id === favId);
    setFavorites((prev) => prev.filter((f) => f.id !== favId));
    const { error } = await supabase.from("user_favorites").delete().eq("id", favId);
    if (error && removed) {
      setFavorites((prev) => [...prev, removed]);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0a18]">
      <div className="flex items-center gap-3 px-5 pt-12 pb-6">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h1 className="text-white font-bold text-lg">Favorilerim</h1>
      </div>

      {!loaded ? (
        <div className="px-5 space-y-3 pb-20">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-2xl animate-pulse" style={{ background: "#1a0e2a" }}>
              <div className="w-12 h-12 rounded-xl bg-white/10 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-white/10" />
                <div className="h-3 w-1/2 rounded bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="text-center py-16 text-[#6b7280] text-sm">Henüz favori eklenmedi</div>
      ) : (
        <div className="px-5 space-y-3 pb-20">
          {favorites.map((fav) => (
            <div key={fav.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#1a0e2a" }}>
              <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-white/10">
                {fav.songs.album_cover_url && (
                  <Image src={fav.songs.album_cover_url} alt="" width={48} height={48} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{fav.songs.title}</p>
                <p className="text-[#6b7280] text-xs">{fav.songs.artist}</p>
              </div>
              <button onClick={() => removeFavorite(fav.id)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#e91e8c">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="#e91e8c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
