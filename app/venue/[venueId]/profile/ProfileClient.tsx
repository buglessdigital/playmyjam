"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Heart, Link2, ListMusic, LogOut, Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { useVenueGate } from "@/lib/venue-gate";
import { isGuestAccount } from "@/lib/guest-session";
import { AVATARS, AvatarMark, isAvatarId } from "@/lib/avatars";
import Coin from "@/components/ui/Coin";
import LangToggle from "@/components/ui/LangToggle";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { useT } from "@/lib/i18n";
import { publishTokenBalance } from "@/lib/token-balance-store";

type ProfileState = {
  username: string | null;
  avatar_id: string | null;
  token_balance: number;
  fav_count: number;
  request_count: number;
};

type RecentSong = {
  song_id: string;
  title: string;
  artist: string;
  album_cover_url: string | null;
};

interface Props {
  venueId: string;
  venueDbId: string;
}

export default function ProfileClient({ venueId, venueDbId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { requireAccount } = useVenueGate(venueId);
  // Misafir kimliğiyle gezen müşteri: jetonları bu cihazdaki hesaba bağlı.
  // Başka cihazda da kullanabilmesi için e-posta/Google bağlaması gerekiyor.
  const [isGuest, setIsGuest] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isGuestAccount().then((guest) => {
      if (!cancelled) setIsGuest(guest);
    });
    return () => {
      cancelled = true;
    };
  }, []);
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
  const openPicker = async () => {
    if (!(await requireAccount())) return;
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

  // Son çaldırdıkları ayrı istek: profil özeti bunu beklemesin
  const [recent, setRecent] = useState<RecentSong[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("get_played_history");
      if (cancelled) return;
      // Aynı şarkı birkaç kez çaldırılmış olabilir — şeritte bir kez görünsün
      const seen = new Set<string>();
      const rows = ((data ?? []) as RecentSong[]).filter((r) => !seen.has(r.song_id) && seen.add(r.song_id));
      setRecent(rows.slice(0, 8));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const initial = username.charAt(0).toUpperCase() || "?";
  const animRequests = useAnimatedNumber(requestCount);
  const animFavs = useAnimatedNumber(favCount);
  const animTokens = useAnimatedNumber(tokenBalance);

  // İstek/favori sayısı ile o sayfaya giden menü satırı eskiden ayrı ayrı
  // duruyordu (aynı bilgi iki kez) — artık sayı kutunun kendisi bağlantı
  const shortcuts = [
    { href: `/venue/${venueId}/requests`, label: t.profile.myRequests, value: animRequests, Icon: ListMusic },
    { href: `/venue/${venueId}/favorites`, label: t.profile.favorites, value: animFavs, Icon: Heart },
  ];

  const cardStyle = { background: "var(--pmj-surface)", border: "1px solid rgb(var(--pmj-ink-rgb) / 0.07)" };

  return (
    <div className="min-h-dvh bg-canvas px-5 pt-14 pb-28">
      {/* Kimlik: sola yaslı, avatar yanında */}
      <div className="flex items-center gap-4">
        <button
          onClick={openPicker}
          aria-label={t.profile.changeAvatarAria}
          className="relative shrink-0 transition-transform active:scale-95"
        >
          <AvatarMark avatarId={avatarId} initial={initial} size={68} />
          {/* Avatara dokunulabildiğini gösteren tek ipucu */}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-canvas bg-ink text-canvas">
            <Pencil size={11} strokeWidth={2.6} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          {loaded ? (
            <>
              <h1 className="truncate text-[24px] font-extrabold leading-tight tracking-tight text-ink">
                {username || email.split("@")[0] || t.profile.guestName}
              </h1>
              <p className="mt-0.5 truncate text-[13px] text-subtle">{email || t.profile.guestEmail}</p>
            </>
          ) : (
            <>
              <div className="h-7 w-40 animate-pulse rounded-lg bg-ink/10" />
              <div className="mt-1.5 h-4 w-48 animate-pulse rounded-lg bg-ink/10" />
            </>
          )}
        </div>
      </div>
      {avatarError && <p className="mt-3 text-[13px] text-red-400">{avatarError}</p>}

      {isGuest && (
        <Link
          href={`/venue/${venueId}/login?next=${encodeURIComponent(`/venue/${venueId}/profile`)}`}
          className="mt-6 flex items-start gap-3 rounded-2xl px-4 py-3.5 transition-transform active:scale-[0.99]"
          style={{ background: "rgba(233,30,140,0.08)", border: "1px solid rgba(233,30,140,0.3)" }}
        >
          <Link2 size={18} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[#e91e8c]" />
          <span className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">{t.profile.linkAccountTitle}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.profile.linkAccountDesc}</p>
          </span>
          <ChevronRight size={16} className="mt-0.5 shrink-0 text-faint" />
        </Link>
      )}

      {/* Cüzdan: sayfanın asıl işi bakiye — jeton alma menü satırı değil, burada */}
      <div className="mt-7 rounded-3xl p-5" style={cardStyle}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.profile.balance}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Coin size={30} />
            {loaded ? (
              <p className="text-[40px] font-black leading-none tracking-tight text-ink tabular-nums">{animTokens}</p>
            ) : (
              <span className="inline-block h-10 w-12 animate-pulse rounded-lg bg-ink/10" />
            )}
            <span className="self-end pb-1 text-sm font-bold text-[#e91e8c]">{t.profile.tokensUnit}</span>
          </div>
          <Link
            href={`/venue/${venueId}/tokens`}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#e91e8c] px-4 py-2.5 text-[13px] font-bold text-white transition-transform active:scale-95"
          >
            <Plus size={15} strokeWidth={2.8} />
            {t.profile.buyShort}
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {shortcuts.map(({ href, label, value, Icon }) => (
          <Link key={href} href={href} className="rounded-2xl p-4 transition-transform active:scale-[0.98]" style={cardStyle}>
            <div className="flex items-center justify-between text-faint">
              <Icon size={17} strokeWidth={2} className="text-muted" />
              <ChevronRight size={15} />
            </div>
            {loaded ? (
              <p className="mt-4 text-[28px] font-extrabold leading-none text-ink tabular-nums">{value}</p>
            ) : (
              <span className="mt-4 inline-block h-7 w-8 animate-pulse rounded-md bg-ink/10" />
            )}
            <p className="mt-1.5 text-[13px] font-semibold text-muted">{label}</p>
          </Link>
        ))}
      </div>

      {/* Son çaldırdıkları: profili ayar ekranından çıkarıp müzik sayfası yapan kısım */}
      <div className="mt-9">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold tracking-tight text-ink">{t.profile.recentPlays}</h2>
          {recent && recent.length > 0 && (
            <Link href={`/venue/${venueId}/history`} className="text-[13px] font-semibold text-[#e91e8c]">
              {t.profile.seeAll}
            </Link>
          )}
        </div>
        {recent === null ? (
          <div className="-mx-5 flex gap-3 overflow-hidden px-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[112px] w-[112px] shrink-0 animate-pulse rounded-xl bg-ink/10" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-6 text-center text-[13px] text-subtle">
            {t.profile.recentEmpty}
          </p>
        ) : (
          <div className="-mx-5 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {recent.map((song) => (
              <Link key={song.song_id} href={`/venue/${venueId}/history`} className="w-[112px] shrink-0 snap-start">
                <div className="h-[112px] w-[112px] overflow-hidden rounded-xl bg-ink/10">
                  {/* YouTube kapakları 4:3 ve üstte/altta siyah bant var — büyütüp kırpılır */}
                  {song.album_cover_url && (
                    <Image src={song.album_cover_url} alt="" width={112} height={112} className="h-full w-full scale-[1.35] object-cover" />
                  )}
                </div>
                <p className="mt-2 truncate text-[13px] font-semibold text-ink">{song.title}</p>
                <p className="truncate text-xs text-subtle">{song.artist}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Dil + tema + ayarlar tek grupta (eskiden her biri ayrı kart) */}
      <p className="mt-9 mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.profile.preferences}</p>
      <div className="divide-y divide-ink/[0.06] overflow-hidden rounded-2xl" style={cardStyle}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[15px] font-medium text-ink">{t.profile.language}</span>
          <LangToggle />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[15px] font-medium text-ink">{t.profile.theme}</span>
          <ThemeToggle />
        </div>
        <Link
          href={`/venue/${venueId}/settings`}
          className="flex items-center justify-between px-4 py-3.5 transition-colors active:bg-ink/5"
        >
          <span className="text-[15px] font-medium text-ink">{t.profile.settings}</span>
          <ChevronRight size={16} className="text-faint" />
        </Link>
      </div>

      <button
        onClick={handleLogout}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-semibold transition-colors active:bg-ink/5"
        style={{ color: "var(--pmj-red)" }}
      >
        <LogOut size={16} strokeWidth={2.2} />
        {t.profile.logout}
      </button>

      {/* Avatar seçici */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl p-6"
            style={{ background: "var(--pmj-surface)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">{t.profile.pickAvatar}</h2>
              <button
                onClick={() => setPickerOpen(false)}
                aria-label={t.common.close}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/5"
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
                      border: `1px solid ${selected ? "rgba(233,30,140,0.6)" : "rgb(var(--pmj-ink-rgb) / 0.07)"}`,
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
                className="mt-5 w-full rounded-xl border border-ink/10 py-3 text-sm font-semibold text-muted"
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
