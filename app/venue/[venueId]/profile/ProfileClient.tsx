"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { useVenueGate } from "@/lib/venue-gate";
import { AVATARS, AvatarMark, isAvatarId } from "@/lib/avatars";
import Coin from "@/components/ui/Coin";
import LangToggle from "@/components/ui/LangToggle";
import { useT } from "@/lib/i18n";
import { publishTokenBalance } from "@/lib/token-balance-store";

type ProfileState = {
  username: string | null;
  avatar_id: string | null;
  token_balance: number;
  fav_count: number;
  request_count: number;
};

interface Props {
  venueId: string;
  venueDbId: string;
}

export default function ProfileClient({ venueId, venueDbId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { requireAccount } = useVenueGate(venueId);
  const t = useT();

  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [avatarError, setAvatarError] = useState("");
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
      setUserId(sessionData.session?.user?.id ?? "");

      const state = stateData as unknown as ProfileState | null;
      if (state) {
        setUsername(state.username ?? sessionEmail.split("@")[0] ?? "");
        setAvatarId(state.avatar_id ?? null);
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

  // Misafir de bu sayfayı görebiliyor — avatar seçimi hesaba bağlı
  const openPicker = () => {
    if (!requireAccount()) return;
    setAvatarError("");
    setPickerOpen(true);
  };

  const chooseAvatar = async (nextId: string | null) => {
    if (!userId || nextId === avatarId) {
      setPickerOpen(false);
      return;
    }
    // Bilinmeyen id veritabanına gitmesin (liste değişmiş olabilir)
    if (nextId !== null && !isAvatarId(nextId)) return;

    const previous = avatarId;
    setAvatarId(nextId);
    setPickerOpen(false);
    setAvatarError("");

    // upsert: profil satırı herhangi bir nedenle yoksa update sessizce 0 satır
    // günceller ve kullanıcı kaydettiğini sanır (ayarlar sayfasıyla aynı gerekçe)
    const { error } = await supabase.from("profiles").upsert({ id: userId, avatar_id: nextId });
    if (error) {
      setAvatarId(previous);
      setAvatarError(t.profile.avatarError);
    }
  };

  const handleLogout = async () => {
    await fetch(`/api/venue/${venueId}/auth`, { method: "DELETE" });
    await supabase.auth.signOut();
    // Çıkıştan sonra da mekan gezilebilir — gözat ekranına dön, giriş ekranına değil.
    // Tam gezinme: client router cache'inde hesaplıyken üretilmiş kayıtlar kalıyor.
    window.location.replace(`/venue/${venueId}/browse`);
  };

  // Alt gezinmedeki jeton rozeti bu sayfanın bakiyesini kullanır (ayrı sorgu yok)
  useEffect(() => {
    if (loaded) publishTokenBalance(tokenBalance);
  }, [loaded, tokenBalance]);

  const initial = username.charAt(0).toUpperCase() || "?";
  const animRequests = useAnimatedNumber(requestCount);
  const animFavs = useAnimatedNumber(favCount);
  const animTokens = useAnimatedNumber(tokenBalance);

  const stats = [
    { label: t.profile.statRequests, value: animRequests },
    { label: t.profile.statFavorites, value: animFavs },
    { label: t.profile.statTokens, value: animTokens },
  ];

  const menu = [
    {
      href: `/venue/${venueId}/tokens`,
      label: t.profile.buyTokens,
      desc: t.profile.buyTokensDesc,
      tint: "rgba(245,165,36,0.1)",
      border: "rgba(245,165,36,0.2)",
      icon: <Coin size={20} />,
    },
    {
      href: `/venue/${venueId}/favorites`,
      label: t.profile.favorites,
      desc: t.profile.favoritesDesc,
      tint: "rgba(244,63,94,0.1)",
      border: "rgba(244,63,94,0.2)",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: `/venue/${venueId}/history`,
      label: t.profile.history,
      desc: t.profile.historyDesc,
      tint: "rgba(59,130,246,0.1)",
      border: "rgba(59,130,246,0.2)",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#3b82f6" strokeWidth="2" />
          <path d="M12 7v5l3 3" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: `/venue/${venueId}/settings`,
      label: t.profile.settings,
      desc: t.profile.settingsDesc,
      tint: "rgba(139,92,246,0.1)",
      border: "rgba(139,92,246,0.2)",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="#8b5cf6" strokeWidth="2" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0f0a18] px-5 pt-12 pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{ background: "radial-gradient(75% 55% at 50% 0%, rgba(233,30,140,0.16), rgba(139,92,246,0.08) 45%, transparent 75%)" }}
      />

      <div className="relative">
        {/* Avatar + kimlik */}
        <div className="flex flex-col items-center pb-8 pt-5">
          <button
            onClick={openPicker}
            aria-label={t.profile.changeAvatarAria}
            className="relative transition-transform active:scale-95"
          >
            <div
              className="rounded-full p-[3px]"
              style={{
                background: "conic-gradient(from 210deg, #e91e8c, #8b5cf6, #3b82f6, #e91e8c)",
                boxShadow: "0 14px 44px -10px rgba(233,30,140,0.5)",
              }}
            >
              <div className="rounded-full bg-[#0f0a18] p-[3px]">
                <AvatarMark avatarId={avatarId} initial={initial} size={84} />
              </div>
            </div>
            {/* Yeşil "çevrimiçi" noktası yerine düzenleme rozeti: avatara
                dokunulabildiğini gösteren tek ipucu bu */}
            <span
              className="absolute bottom-0.5 right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-[#0f0a18]"
              style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M12 20h9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
                <path
                  d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"
                  stroke="#fff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>

          {avatarError && <p className="mt-3 text-[13px] text-red-400">{avatarError}</p>}

          <div className="mt-4 text-center">
            {loaded ? (
              <>
                <h1 className="text-[22px] font-bold tracking-tight text-white">{username || email.split("@")[0]}</h1>
                <p className="mt-1 text-[13px] text-[#6b7280]">{email}</p>
              </>
            ) : (
              <>
                <div className="mx-auto h-6 w-36 animate-pulse rounded-lg bg-white/10" />
                <div className="mx-auto mt-1.5 h-4 w-44 animate-pulse rounded-lg bg-white/10" />
              </>
            )}
          </div>
        </div>

        {/* İstatistikler */}
        <div
          className="mb-7 grid grid-cols-3 overflow-hidden rounded-2xl"
          style={{ background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          {stats.map((s, i) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-1.5 px-2 py-5"
              style={i > 0 ? { borderLeft: "1px solid rgba(255,255,255,0.06)" } : undefined}
            >
              {loaded ? (
                <p className="text-[22px] font-extrabold leading-none text-white tabular-nums">{s.value}</p>
              ) : (
                <span className="inline-block h-[22px] w-8 animate-pulse rounded-md bg-white/10" />
              )}
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6b7280]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Menü */}
        {/* Dil anahtarı buraya taşındı: kuyruk/gözat başlıkları üç düğmeyle
            kalabalıklaşmasın. Misafirde hâlâ başlıkta duruyor (profil hesaba bağlı). */}
        <div
          className="mb-6 flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <span className="text-sm font-semibold text-white">{t.profile.language}</span>
          <LangToggle />
        </div>

        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">{t.profile.account}</p>
        <div className="overflow-hidden rounded-2xl" style={{ background: "#1a0e2a", border: "1px solid rgba(255,255,255,0.07)" }}>
          {menu.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3.5 px-4 py-4 transition-colors active:bg-white/5"
              style={i > 0 ? { borderTop: "1px solid rgba(255,255,255,0.06)" } : undefined}
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: item.tint, border: `1px solid ${item.border}` }}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-white">{item.label}</p>
                <p className="mt-0.5 text-xs text-[#6b7280]">{item.desc}</p>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="#4b5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>

        {/* Çıkış */}
        <button
          onClick={handleLogout}
          className="mt-4 flex w-full items-center gap-3.5 rounded-2xl px-4 py-4 text-left transition-all active:scale-[0.99]"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)" }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12H9" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="flex-1">
            <p className="text-[15px] font-semibold text-[#ef4444]">{t.profile.logout}</p>
            <p className="mt-0.5 text-xs text-[#ef4444]/50">{t.profile.logoutDesc}</p>
          </span>
        </button>

        <p className="mt-8 text-center text-[11px] font-medium tracking-[0.2em] text-[#3f3a4d]">PLAYMYJAM</p>
      </div>

      {/* Avatar seçici */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl p-6"
            style={{ background: "#1a0e2a" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{t.profile.pickAvatar}</h2>
              <button
                onClick={() => setPickerOpen(false)}
                aria-label={t.common.close}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {AVATARS.map((avatar) => {
                const selected = avatar.id === avatarId;
                return (
                  <button
                    key={avatar.id}
                    onClick={() => chooseAvatar(avatar.id)}
                    aria-label={avatar.label}
                    aria-pressed={selected}
                    className="flex items-center justify-center rounded-2xl p-1.5 transition-all active:scale-95"
                    style={{
                      background: selected ? "rgba(233,30,140,0.12)" : "transparent",
                      border: `1px solid ${selected ? "rgba(233,30,140,0.6)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <AvatarMark avatarId={avatar.id} initial={initial} size={56} />
                  </button>
                );
              })}
            </div>

            {/* Avatardan vazgeçme yolu: baş harfe dön */}
            {avatarId !== null && (
              <button
                onClick={() => chooseAvatar(null)}
                className="mt-5 w-full rounded-xl border border-white/10 py-3 text-sm font-semibold text-[#9ca3af]"
              >
                {t.profile.removeAvatar}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
