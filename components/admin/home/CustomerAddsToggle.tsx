"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CUSTOMER_ADDS_PAUSE_MAX_MS, isCustomerAddsPaused } from "@/lib/customer-adds";
import { useVenueLive } from "@/lib/venue-live";

const timeFmt = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

/**
 * Müşteri eklemelerini kapat/aç (0072). Mekan kapanışa yaklaşınca basar:
 * müşteriler sıraya şarkı ekleyemez ve talep gönderemez; sıradakiler, otomatik
 * doldurma ve panelden ekleme olduğu gibi çalışır. Kapatma 12 saat sonra
 * kendiliğinden düşer (bkz. lib/customer-adds.ts).
 *
 * Değer now_playing'den okunur, değişiklik mekan canlı hattının `np`
 * mesajıyla gelir — başka cihazdan basılan anahtar da burada görünür.
 */
export default function CustomerAddsToggle({ venueDbId }: { venueDbId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  // 0072 uygulanmadıysa kolon yok: anahtar hiç çizilmez (basılsa da yazamaz)
  const [available, setAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Kendi yazdığımız değer yoldayken gelen eski np mesajı anahtarı geri çevirmesin
  const touchedAtRef = useRef(0);
  const fetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!venueDbId) return;
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("now_playing")
        .select("customer_adds_paused_at")
        .eq("venue_id", venueDbId)
        .maybeSingle();
      if (cancelled || error) return;
      setAvailable(true);
      setPausedAt((data as { customer_adds_paused_at: string | null } | null)?.customer_adds_paused_at ?? null);
    };
    fetchRef.current = load;
    load();
    const interval = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      cancelled = true;
      fetchRef.current = () => {};
      clearInterval(interval);
    };
  }, [venueDbId, supabase]);

  useVenueLive(venueDbId, (event, payload) => {
    if (event === "np") {
      if (!("customer_adds_paused_at" in payload) || Date.now() - touchedAtRef.current < 2_000) return;
      const at = payload.customer_adds_paused_at;
      if (typeof at === "string" || at === null) setPausedAt(at);
    } else if (event === "resync") {
      fetchRef.current();
    }
  });

  if (!available) return null;

  const paused = isCustomerAddsPaused(pausedAt, nowMs);

  const toggle = async () => {
    if (saving) return;
    const next = !paused;
    const prev = pausedAt;
    setError("");
    setSaving(true);
    touchedAtRef.current = Date.now();
    setPausedAt(next ? new Date().toISOString() : null);
    try {
      const res = await fetch(`/api/player/${venueDbId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "customer_adds", paused: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Kaydedilemedi");
      if (data && "paused_at" in data) setPausedAt(data.paused_at ?? null);
    } catch (e) {
      setPausedAt(prev);
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      touchedAtRef.current = Date.now();
      setSaving(false);
    }
  };

  const reopenAt = paused && pausedAt ? timeFmt.format(Date.parse(pausedAt) + CUSTOMER_ADDS_PAUSE_MAX_MS) : null;

  return (
    <div
      className="flex items-center gap-3 mt-3 rounded-xl px-3 py-2.5"
      style={
        paused
          ? { background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)" }
          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
      }
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: paused ? "#fbbf24" : "#e5e7eb" }}>
          {paused ? "Müşteri eklemeleri kapalı" : "Müşteriler şarkı ekleyebilir"}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: paused ? "#d97706" : "#6b7280" }}>
          {paused
            ? `Sıradakiler çalmaya devam ediyor · ${reopenAt}'de kendiliğinden açılır`
            : "Kapanışa yakın kapatın — müşteriler sıraya ekleyemez, talep gönderemez"}
        </p>
        {error && <p className="text-[10px] mt-1" style={{ color: "#f87171" }}>{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!paused}
        aria-label="Müşteri eklemeleri"
        onClick={() => void toggle()}
        disabled={saving}
        className="relative shrink-0 w-10 h-6 rounded-full transition-colors disabled:opacity-60"
        style={{ background: paused ? "rgba(255,255,255,0.15)" : "#22c55e" }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: paused ? "translateX(0)" : "translateX(16px)" }}
        />
      </button>
    </div>
  );
}
