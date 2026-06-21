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
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      setEmail(user.email ?? "");

      const [profileRes, venueRes, favRes, reqRes] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", user.id).single(),
        supabase.from("venues").select("id").eq("slug", venueId).single(),
        supabase.from("user_favorites").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("queue").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      if (profileRes.data) setUsername(profileRes.data.username ?? user.email?.split("@")[0] ?? "");
      setFavCount(favRes.count ?? 0);
      setRequestCount(reqRes.count ?? 0);

      if (venueRes.data) {
        const { data: tk } = await supabase.from("user_tokens").select("balance").eq("user_id", user.id).eq("venue_id", venueRes.data.id).maybeSingle();
        setTokenBalance(tk?.balance ?? 0);
      }
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
    <div style={{ background: "#0f0a18", minHeight: "100dvh", width: "100%", paddingBottom: 100 }}>

      {/* Header gradient */}
      <div style={{ position: "relative", padding: "48px 20px 0" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 220,
          background: "linear-gradient(180deg, rgba(233,30,140,0.12) 0%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* Avatar + info */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 24, paddingBottom: 32 }}>
          <div style={{ position: "relative" }}>
            <div style={{
              width: 88, height: 88, borderRadius: "50%",
              background: "linear-gradient(135deg, #e91e8c, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, fontWeight: 900, color: "white",
              boxShadow: "0 0 0 3px rgba(233,30,140,0.25), 0 8px 32px rgba(233,30,140,0.3)",
            }}>
              {initial}
            </div>
            <div style={{
              position: "absolute", bottom: 2, right: 2,
              width: 18, height: 18, borderRadius: "50%",
              background: "#22c55e", border: "2px solid #0f0a18",
            }} />
          </div>

          <div style={{ textAlign: "center" }}>
            <h1 style={{ color: "white", fontWeight: 700, fontSize: 22, margin: 0, letterSpacing: "-0.3px" }}>
              {username || email.split("@")[0]}
            </h1>
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>{email}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "0 20px 24px" }}>
        {[
          { label: "İstek", value: requestCount, icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z", color: "#8b5cf6" },
          { label: "Favori", value: favCount, icon: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z", color: "#e91e8c" },
          { label: "Jeton", value: tokenBalance, icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-4H9l3-6 3 6h-2v4z", color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{
            borderRadius: 18,
            padding: "18px 12px",
            textAlign: "center",
            background: "linear-gradient(145deg, #1e1030 0%, #150b25 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d={s.icon} stroke={s.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p style={{ color: "white", fontWeight: 800, fontSize: 22, margin: 0, lineHeight: 1 }}>{s.value}</p>
            <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Menu */}
      <div style={{ margin: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          {
            href: `/venue/${venueId}/tokens`,
            label: "Jeton Satın Al",
            desc: "Bakiyeni artır",
            iconPath: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-4H9l3-6 3 6h-2v4z",
            iconColor: "#f59e0b",
            iconBg: "rgba(245,158,11,0.12)",
          },
          {
            href: `/venue/${venueId}/favorites`,
            label: "Favorilerim",
            desc: "Kaydettiğin şarkılar",
            iconPath: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
            iconColor: "#e91e8c",
            iconBg: "rgba(233,30,140,0.12)",
          },
          {
            href: `/venue/${venueId}/settings`,
            label: "Ayarlar",
            desc: "Hesap tercihlerin",
            iconPath: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
            iconColor: "#8b5cf6",
            iconBg: "rgba(139,92,246,0.12)",
          },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 16px",
            borderRadius: 18,
            background: "linear-gradient(145deg, #1e1030 0%, #150b25 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            textDecoration: "none",
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: item.iconBg,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d={item.iconPath} stroke={item.iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "white", fontWeight: 600, fontSize: 15, margin: 0 }}>{item.label}</p>
              <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>{item.desc}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l6-6-6-6" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ))}

        {/* Logout */}
        <button onClick={handleLogout} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 14,
          padding: "14px 16px",
          borderRadius: 18,
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.15)",
          cursor: "pointer", textAlign: "left",
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "rgba(239,68,68,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#ef4444", fontWeight: 600, fontSize: 15, margin: 0 }}>Çıkış Yap</p>
            <p style={{ color: "rgba(239,68,68,0.5)", fontSize: 12, margin: "2px 0 0" }}>Hesabından çık</p>
          </div>
        </button>
      </div>
    </div>
  );
}
