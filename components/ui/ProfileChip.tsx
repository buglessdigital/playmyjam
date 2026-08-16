"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AvatarMark } from "@/lib/avatars";
import { useVenueGate } from "@/lib/venue-gate";
import { useT } from "@/lib/i18n";

interface Props {
  venueId: string;
}

type Cached = { avatarId: string | null; initial: string };

const CACHE_KEY = "pmj-profile-chip";

function readCache(): Cached | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

/**
 * Başlıktaki profil düğmesi. Avatar tek küçük sorguyla okunur; her sayfa
 * geçişinde ağa çıkmasın diye sonuç sekme belleğinde tutulur, arka planda
 * yine de tazelenir (başka sekmede avatar değişmiş olabilir).
 * Misafirde hiç render edilmez — onun yerinde zaten "Giriş Yap" çipi var.
 */
export default function ProfileChip({ venueId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { isMember } = useVenueGate(venueId);
  const t = useT();
  // İlk boyama sekme belleğinden (sunucu anlık görüntüsünde zaten misafir
  // görünüyoruz, çıktı null — uyumsuzluk olmaz)
  const [profile, setProfile] = useState<Cached | null>(readCache);

  useEffect(() => {
    if (!isMember) return;

    let cancelled = false;
    const load = async () => {
      // Oturum lokalden okunur (ağ yok); tek satırlık profil sorgusu
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("profiles")
        .select("avatar_id, username")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;

      const name = (data?.username as string | null) ?? user.email ?? "";
      const next: Cached = {
        avatarId: (data?.avatar_id as string | null) ?? null,
        initial: name.charAt(0).toUpperCase() || "?",
      };
      setProfile(next);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        /* özel kip: önbellek yoksa her açılışta yeniden sorgulanır */
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [isMember, supabase]);

  if (!isMember) return null;

  return (
    <Link
      href={`/venue/${venueId}/profile`}
      aria-label={t.panelNav.profileAria}
      className="shrink-0 rounded-full p-[2px] transition-transform active:scale-95"
      style={{ background: "linear-gradient(135deg, #e91e8c, #8b5cf6)" }}
    >
      <span className="block rounded-full bg-[#0f0a18] p-[2px]">
        {profile ? (
          <AvatarMark avatarId={profile.avatarId} initial={profile.initial} size={28} />
        ) : (
          <span className="block h-7 w-7 animate-pulse rounded-full bg-white/10" />
        )}
      </span>
    </Link>
  );
}
