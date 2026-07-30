"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Şifre sıfırlama bağlantısının indiği sayfa. Üç şablon biçimini de karşılar:
//   token_hash → verifyOtp        (özelleştirilmiş şablon)
//   ?code=     → PKCE takası      (varsayılan {{ .ConfirmationURL }})
//   #access_token → setSession    (eski implicit şablon)
// /auth/confirm üzerinden gelindiyse oturum zaten açıktır; hiçbiri yoksa ona bakılır.
type Phase = "verifying" | "form" | "invalid" | "done";

const INVALID_MESSAGE =
  "Bağlantı geçersiz veya süresi dolmuş. Giriş ekranından yeni bir sıfırlama bağlantısı iste.";
const PKCE_MESSAGE =
  "Bağlantı doğrulanamadı. Sıfırlama isteğini başlattığın cihaz ve tarayıcıda açtığından emin ol.";
const EXPIRED_MESSAGE =
  "Bağlantının süresi dolmuş. Giriş ekranından yeni bir sıfırlama bağlantısı iste.";

// Mekan kimliği PKCE yönlendirmesinde kaybolabiliyor: Supabase ?code= eklerken
// redirectTo'nun sorgu kısmını eziyor. Sıfırlama istenirken bırakılan çerez yedek.
const RESET_VENUE_COOKIE = "pmj_reset_venue";

function readResetVenueCookie(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${RESET_VENUE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function clearResetVenueCookie() {
  document.cookie = `${RESET_VENUE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

type VerifyResult = { ok: true } | { ok: false; reason: "pkce" | "token" | "missing" };

// Doğrulama tek sefer çalışmalı — token tek kullanımlık. useSearchParams() statik
// kabukta Suspense'e düşürdüğü için bileşen sıfırdan mount olabiliyor; bu durumda
// useRef guard'ı sıfırlanır. Bu yüzden tekilleştirme modül seviyesinde, token'a göre.
let pendingVerification: { key: string; promise: Promise<VerifyResult> } | null = null;

function verifyOnce(key: string, run: () => Promise<VerifyResult>): Promise<VerifyResult> {
  if (pendingVerification?.key === key) return pendingVerification.promise;
  const promise = run();
  pendingVerification = { key, promise };
  return promise;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [venueId, setVenueId] = useState(() => searchParams.get("venueId") || "");
  const [phase, setPhase] = useState<Phase>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [invalidReason, setInvalidReason] = useState(INVALID_MESSAGE);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const hashParams = new URLSearchParams(
        typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : ""
      );
      const param = (key: string) => searchParams.get(key) ?? hashParams.get(key);

      // PKCE yönlendirmesi sorguyu ezdiyse mekan bilgisi çerezden gelir
      const resolvedVenueId = searchParams.get("venueId") || readResetVenueCookie();
      if (resolvedVenueId) setVenueId(resolvedVenueId);

      // Supabase doğrulama uçları hatayı ya query'de ya hash'te döndürür
      const errorCode = param("error_code") || param("error");
      if (errorCode) {
        setInvalidReason(errorCode.includes("expired") ? EXPIRED_MESSAGE : INVALID_MESSAGE);
        setPhase("invalid");
        return;
      }

      const tokenHash = param("token_hash");
      const code = param("code");
      const accessToken = param("access_token");
      const refreshToken = param("refresh_token");
      const key = tokenHash || code || accessToken || "session";

      const result = await verifyOnce(key, async (): Promise<VerifyResult> => {
        if (tokenHash) {
          const type = (param("type") as EmailOtpType) || "recovery";
          const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          return error ? { ok: false, reason: "token" } : { ok: true };
        }
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          // PKCE doğrulayıcısı isteği başlatan tarayıcıda saklanır
          return error ? { ok: false, reason: "pkce" } : { ok: true };
        }
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          return error ? { ok: false, reason: "token" } : { ok: true };
        }
        return { ok: false, reason: "missing" };
      });

      let failure = result.ok ? "" : result.reason;
      if (failure) {
        // Token başka bir mount'ta çoktan tüketilmiş ya da /auth/confirm oturumu
        // zaten açmış olabilir — oturum varsa kullanıcıyı hataya düşürme.
        const { data } = await supabase.auth.getSession();
        if (data.session) failure = "";
      }

      if (failure) {
        setInvalidReason(failure === "pkce" ? PKCE_MESSAGE : INVALID_MESSAGE);
        setPhase("invalid");
        return;
      }

      // Token'ı adres çubuğundan ve geçmişten temizle
      router.replace(resolvedVenueId ? `/auth/reset?venueId=${resolvedVenueId}` : "/auth/reset");
      setPhase("form");
    };

    run();
  }, [searchParams, router]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setError("");

    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Şifreler birbiriyle eşleşmiyor.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      const msg = updateError.message.toLowerCase();
      if (msg.includes("should be different") || msg.includes("same as the")) {
        setError("Yeni şifre eskisiyle aynı olamaz.");
      } else if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429")) {
        setError("Çok fazla deneme yapıldı. Birkaç saniye bekleyip tekrar dene.");
      } else if (msg.includes("session") || msg.includes("jwt") || msg.includes("expired")) {
        setSaving(false);
        setPhase("invalid");
        return;
      } else {
        setError("Şifre güncellenemedi. Lütfen tekrar dene.");
      }
      setSaving(false);
      return;
    }

    // Şifre değişti; oturum açık. Mekandan gelindiyse o mekana da giriş yaptır.
    clearResetVenueCookie();
    if (venueId) {
      await fetch(`/api/venue/${venueId}/auth`, { method: "POST" }).catch(() => null);
      router.replace(`/venue/${venueId}/queue`);
      return;
    }
    setSaving(false);
    setPhase("done");
  }, [confirmPassword, password, router, saving, venueId]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0f0a18] max-w-md mx-auto px-6 pt-16 pb-10">
      <span className="text-white font-bold text-lg tracking-wide mb-10">PlayMyJam</span>

      {phase === "verifying" && (
        <div className="flex items-center gap-3 text-[#9ca3af] text-sm">
          <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          Bağlantı doğrulanıyor...
        </div>
      )}

      {phase === "invalid" && (
        <>
          <h1 className="text-2xl font-bold text-white mb-2">Bağlantı kullanılamadı</h1>
          <p className="text-sm text-[#9ca3af] mb-6">{invalidReason}</p>
          <button
            onClick={() => router.replace(venueId ? `/venue/${venueId}` : "/")}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-base transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
          >
            Giriş ekranına dön
          </button>
        </>
      )}

      {phase === "done" && (
        <>
          <h1 className="text-2xl font-bold text-white mb-2">Şifren güncellendi</h1>
          <p className="text-sm text-[#9ca3af] mb-6">
            Artık yeni şifrenle giriş yapabilirsin.
          </p>
          <button
            onClick={() => router.replace("/")}
            className="w-full py-3.5 rounded-2xl font-bold text-white text-base transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
          >
            Ana sayfaya dön
          </button>
        </>
      )}

      {phase === "form" && (
        <>
          <h1 className="text-3xl font-bold text-white leading-tight mb-1">
            Yeni <span className="text-[#e91e8c]">şifreni</span> belirle
          </h1>
          <p className="text-[#9ca3af] text-sm mb-8">
            En az 6 karakter olmalı. Kaydettiğinde oturumun otomatik açılacak.
          </p>

          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#9ca3af] mb-1.5 block">Yeni şifre</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Yeni şifren"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-[#1a0e2a] border border-white/10 rounded-xl py-3 px-4 pr-10 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/50 transition-colors"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    {showPassword ? (
                      <path
                        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M9 12a3 3 0 106 0 3 3 0 00-6 0"
                        stroke="#6b7280"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    ) : (
                      <>
                        <path
                          d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"
                          stroke="#6b7280"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M3 3l18 18"
                          stroke="#6b7280"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-[#9ca3af] mb-1.5 block">Yeni şifre (tekrar)</label>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Yeni şifren tekrar"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                autoComplete="new-password"
                className="w-full bg-[#1a0e2a] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/50 transition-colors"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !password || !confirmPassword}
              className="block w-full text-center py-3.5 rounded-2xl font-bold text-white text-base mt-2 transition-all active:scale-95 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
            >
              {saving ? "Kaydediliyor..." : "Şifreyi Güncelle →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
