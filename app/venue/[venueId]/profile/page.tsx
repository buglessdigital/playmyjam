"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function ProfilePage({ params }: Props) {
  const { venueId } = use(params);
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [tokenBalance, setTokenBalance] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");

      const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
      if (profile) setUsername(profile.username ?? user.email?.split("@")[0] ?? "");

      const { data: venue } = await supabase.from("venues").select("id").eq("slug", venueId).single();
      if (venue) {
        const { data: tk } = await supabase.from("user_tokens").select("balance").eq("user_id", user.id).eq("venue_id", venue.id).maybeSingle();
        setTokenBalance(tk?.balance ?? 0);
      }

      const { count: fav } = await supabase.from("user_favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setFavCount(fav ?? 0);

      const { count: req } = await supabase.from("queue").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      setRequestCount(req ?? 0);
    };
    load();
  }, [venueId]);

  const handleLogout = async () => {
    await fetch(`/api/venue/${venueId}/auth`, { method: "DELETE" });
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(`/venue/${venueId}`);
  };

  const initial = username.charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-[#0f0a18] pb-32">
      <div className="px-5 pt-12 pb-6 flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center font-black text-3xl" style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)", color: "white" }}>
          {initial}
        </div>
        <div className="text-center">
          <h1 className="text-white font-bold text-xl">{username || email}</h1>
          <p className="text-[#6b7280] text-sm">{email}</p>
        </div>
      </div>

      <div className="mx-5 grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "İstek", value: requestCount },
          { label: "Favori", value: favCount },
          { label: "Jeton", value: tokenBalance },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-4 text-center" style={{ background: "#1a0e2a" }}>
            <p className="text-white font-bold text-xl">{s.value}</p>
            <p className="text-[#6b7280] text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mx-5 rounded-2xl overflow-hidden border border-white/10">
        <Link href={`/venue/${venueId}/tokens`} className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 hover:bg-white/5 transition-colors">
          <span className="text-white text-sm font-medium">Jeton Satın Al</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <Link href={`/venue/${venueId}/favorites`} className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 hover:bg-white/5 transition-colors">
          <span className="text-white text-sm font-medium">Favorilerim</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <Link href={`/venue/${venueId}/settings`} className="flex items-center justify-between px-4 py-3.5 border-b border-white/10 hover:bg-white/5 transition-colors">
          <span className="text-white text-sm font-medium">Ayarlar</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/5 transition-colors">
          <span className="text-red-400 text-sm font-medium">Çıkış Yap</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  );
}
