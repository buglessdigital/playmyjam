"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { VenueListItem } from "@/lib/venue-cache";
import VenueLogo from "@/components/VenueLogo";
import { fmt, useT } from "@/lib/i18n";

const PINK_GRADIENT = "linear-gradient(135deg, #ff2d9c 0%, #e91e8c 45%, #a8125f 100%)";

// Aramada "İ/ı" farkı yüzünden mekan kaçmasın: TR küçültme + aksan sadeleştirme
function normalize(value: string) {
  return value
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Ana sayfadan mekan admin girişi: sahibi mekanını arayıp seçer, ardından panel
 * kimlik bilgileriyle giriş yapar. Hedef panel her zaman API'nin döndürdüğü
 * mekandır — kullanıcı adı hangi mekana bağlıysa oraya gidilir, seçim yalnızca
 * doğru mekanda olduğunu teyit etmeye yarar.
 */
export default function VenueAdminLogin({ venues }: { venues: VenueListItem[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VenueListItem | null>(null);
  const [manual, setManual] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Şifre sıfırlama, panel giriş ekranındaki gibi ikinci bir mod olarak duruyor
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetSent, setResetSent] = useState("");

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const list = q ? venues.filter((v) => normalize(v.name).includes(q) || normalize(v.slug).includes(q)) : venues;
    return list.slice(0, 8);
  }, [query, venues]);

  const step2 = !!selected || manual;

  const switchMode = (next: "login" | "forgot") => {
    setMode(next);
    setError("");
    setResetSent("");
  };

  const handleForgot = async () => {
    if (!username.trim()) {
      setError(t.venueAdminLogin.errUsernameMissing);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), venueId: selected?.slug ?? "" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? t.venueAdminLogin.errResetFailed);
        return;
      }
      setResetSent(data?.message ?? t.venueAdminLogin.resetSent);
    } catch {
      setError(t.venueAdminLogin.errConnection);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError(t.venueAdminLogin.errMissing);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? t.venueAdminLogin.errFailed);
        setLoading(false);
        return;
      }
      const slug: string | undefined = data?.venue?.slug;
      if (!slug) {
        setError(t.venueAdminLogin.errFailed);
        setLoading(false);
        return;
      }
      if (selected && slug !== selected.slug) {
        // Kimlik bilgileri başka mekana ait: sessizce oraya atmak yerine söyle
        setError(fmt(t.venueAdminLogin.errWrongVenue, { venue: selected.name }));
        setLoading(false);
        return;
      }
      // Tam gezinme: erişim kararını proxy çerezten veriyor, router cache'i atlanmalı
      window.location.replace(`/admin/${slug}`);
    } catch {
      setError(t.venueAdminLogin.errConnection);
      setLoading(false);
    }
  };

  const reset = () => {
    setSelected(null);
    setManual(false);
    setError("");
    setPassword("");
    setMode("login");
    setResetSent("");
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-white/[0.08] p-6 sm:p-7" style={{ background: "#160d24" }}>
        {!step2 ? (
          <>
            <p className="text-sm font-bold text-white">{t.venueAdminLogin.step1Title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9ca3af]">{t.venueAdminLogin.step1Desc}</p>

            <div className="relative mt-5">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.venueAdminLogin.searchPlaceholder}
                aria-label={t.venueAdminLogin.searchPlaceholder}
                autoComplete="off"
                className="w-full rounded-xl px-3.5 py-3 pl-10 text-sm text-white outline-none placeholder:text-[#6b7280] focus:border-[#e91e8c]/50"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b7280]"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {results.length === 0 ? (
                <p className="rounded-xl border border-white/[0.06] px-4 py-5 text-center text-xs text-[#9ca3af]">
                  {t.venueAdminLogin.noResults}
                </p>
              ) : (
                results.map((v) => (
                  <button
                    key={v.slug}
                    type="button"
                    onClick={() => {
                      setSelected(v);
                      setError("");
                    }}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] px-4 py-3 text-left transition-colors hover:border-[#e91e8c]/40 hover:bg-white/[0.04]"
                  >
                    <VenueLogo
                      name={v.name}
                      logoUrl={v.logo_url}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
                      fallbackStyle={{ background: "rgba(233,30,140,0.15)", color: "#e91e8c" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">{v.name}</span>
                      <span className="block truncate text-[11px] text-[#6b7280]">/{v.slug}</span>
                    </span>
                    <span className="shrink-0 text-sm text-[#e91e8c]">→</span>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setManual(true)}
              className="mt-4 w-full text-center text-xs text-[#9ca3af] underline underline-offset-4 hover:text-white"
            >
              {t.venueAdminLogin.cantFind}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  {mode === "forgot"
                    ? t.venueAdminLogin.forgotTitle
                    : selected
                      ? selected.name
                      : t.venueAdminLogin.step2TitleGeneric}
                </p>
                <p className="mt-1 truncate text-[11px] text-[#6b7280]">
                  {selected ? `/admin/${selected.slug}` : t.venueAdminLogin.step2DescGeneric}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-[#9ca3af] transition-colors hover:bg-white/10 hover:text-white"
              >
                {t.venueAdminLogin.change}
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                  {error}
                </div>
              )}

              {mode === "forgot" && (
                <p className="text-xs leading-relaxed text-[#9ca3af]">{t.venueAdminLogin.forgotDesc}</p>
              )}

              {resetSent && (
                <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-2.5 text-sm text-[#22c55e]">
                  {resetSent}
                </div>
              )}

              <div>
                <label htmlFor="pmj-admin-username" className="mb-1.5 block text-xs text-[#9ca3af]">
                  {t.venueAdminLogin.username}
                </label>
                <input
                  id="pmj-admin-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && mode === "forgot" && handleForgot()}
                  autoComplete="username"
                  placeholder="neon_admin"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>

              {mode === "login" && (
              <div>
                <label htmlFor="pmj-admin-password" className="mb-1.5 block text-xs text-[#9ca3af]">
                  {t.venueAdminLogin.password}
                </label>
                <div className="relative">
                  <input
                    id="pmj-admin-password"
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? t.venueAdminLogin.hidePassword : t.venueAdminLogin.showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280]"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      {showPass ? (
                        <path
                          d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M9 12a3 3 0 106 0 3 3 0 00-6 0"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      ) : (
                        <>
                          <path
                            d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M3 3l18 18"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
              )}

              <button
                type="button"
                onClick={mode === "login" ? handleLogin : handleForgot}
                disabled={loading}
                className="w-full rounded-xl py-3 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                style={{ background: PINK_GRADIENT, boxShadow: "0 8px 22px -8px rgba(233,30,140,0.55)" }}
              >
                {loading
                  ? mode === "login"
                    ? t.venueAdminLogin.signingIn
                    : t.venueAdminLogin.forgotSending
                  : mode === "login"
                    ? t.venueAdminLogin.signIn
                    : t.venueAdminLogin.forgotSubmit}
              </button>

              <button
                type="button"
                onClick={() => switchMode(mode === "login" ? "forgot" : "login")}
                className="text-center text-xs text-[#9ca3af] underline underline-offset-4 transition-colors hover:text-white"
              >
                {mode === "login" ? t.venueAdminLogin.forgotLink : t.venueAdminLogin.backToLogin}
              </button>
            </div>
          </>
        )}
      </div>

      <p className="mt-5 text-center text-xs leading-relaxed text-[#6b7280]">
        {t.venueAdminLogin.customerHintPrefix}{" "}
        <Link href="/mekanlar" className="text-[#e91e8c] underline hover:text-[#ff2d9c]">
          {t.venueAdminLogin.customerHintLink}
        </Link>
        .{" "}
        {t.venueAdminLogin.applyHintPrefix}{" "}
        <Link href="/#mekan-basvuru" className="text-[#e91e8c] underline hover:text-[#ff2d9c]">
          {t.venueAdminLogin.applyHintLink}
        </Link>
        .
      </p>
    </div>
  );
}
