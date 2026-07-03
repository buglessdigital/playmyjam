"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ProfileState = {
  username: string | null;
  token_balance: number;
  fav_count: number;
  request_count: number;
};

interface Props {
  venueId: string;
  venueDbId: string;
}

export default function ProfileClient({ venueId, venueDbId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [tokenBalance, setTokenBalance] = useState(0);
  const [favCount, setFavCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;

    const load = async () => {
      // E-posta lokal session'dan (ağ çağrısı yok); özet tek RPC round-trip (0006)
      const [{ data: sessionData }, { data: stateData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.rpc("get_profile_state", { p_venue_id: venueDbId }),
      ]);
      if (cancelled) return;

      const sessionEmail = sessionData.session?.user?.email ?? "";
      setEmail(sessionEmail);

      const state = stateData as unknown as ProfileState | null;
      if (state) {
        setUsername(state.username ?? sessionEmail.split("@")[0] ?? "");
        setTokenBalance(state.token_balance ?? 0);
        setFavCount(state.fav_count ?? 0);
        setRequestCount(state.request_count ?? 0);
      }
      setLoaded(true);
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [venueDbId, supabase]);

  const handleLogout = async () => {
    await fetch(`/api/venue/${venueId}/auth`, { method: "DELETE" });
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
            {loaded ? (
              <>
                <h1 style={{ color: "white", fontWeight: 700, fontSize: 22, margin: 0, letterSpacing: "-0.3px" }}>
                  {username || email.split("@")[0]}
                </h1>
                <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>{email}</p>
              </>
            ) : (
              <>
                <div className="h-6 w-36 rounded-lg bg-white/10 animate-pulse" style={{ margin: "0 auto" }} />
                <div className="h-4 w-44 rounded-lg bg-white/10 animate-pulse" style={{ margin: "6px auto 0" }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, margin: "0 20px 24px" }}>
        {[
          { label: "İstek", value: requestCount },
          { label: "Favori", value: favCount },
          { label: "Jeton", value: tokenBalance },
        ].map((s) => (
          <div key={s.label} style={{
            borderRadius: 18,
            padding: "20px 12px",
            textAlign: "center",
            background: "linear-gradient(145deg, #1e1030 0%, #150b25 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <p style={{ color: "white", fontWeight: 800, fontSize: 24, margin: 0, lineHeight: 1 }}>{loaded ? s.value : "–"}</p>
            <p style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Menu */}
      <div style={{ margin: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { href: `/venue/${venueId}/tokens`, label: "Jeton Satın Al", desc: "Bakiyeni artır" },
          { href: `/venue/${venueId}/favorites`, label: "Favorilerim", desc: "Kaydettiğin şarkılar" },
          { href: `/venue/${venueId}/settings`, label: "Ayarlar", desc: "Hesap tercihlerin" },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{
            display: "flex", alignItems: "center",
            padding: "16px 20px",
            borderRadius: 18,
            background: "linear-gradient(145deg, #1e1030 0%, #150b25 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
            textDecoration: "none",
          }}>
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
          width: "100%", display: "flex", alignItems: "center",
          padding: "16px 20px",
          borderRadius: 18,
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.15)",
          cursor: "pointer", textAlign: "left",
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#ef4444", fontWeight: 600, fontSize: 15, margin: 0 }}>Çıkış Yap</p>
            <p style={{ color: "rgba(239,68,68,0.5)", fontSize: 12, margin: "2px 0 0" }}>Hesabından çık</p>
          </div>
        </button>
      </div>
    </div>
  );
}
