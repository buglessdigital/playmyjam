"use client";

import { useState, use, Suspense } from "react";

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function AdminLoginPage({ params }: Props) {
  return (
    <Suspense>
      <AdminLoginForm params={params} />
    </Suspense>
  );
}

function AdminLoginForm({ params }: Props) {
  const { venueId } = use(params);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Şifre sıfırlama, girişle aynı ekranda ikinci bir mod olarak duruyor
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetSent, setResetSent] = useState("");

  const switchMode = (next: "login" | "forgot") => {
    setMode(next);
    setError("");
    setResetSent("");
  };

  const handleForgot = async () => {
    if (!username.trim()) {
      setError("Kullanıcı adınızı veya Google adresinizi girin");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), venueId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "İstek gönderilemedi");
        return;
      }
      setResetSent(data?.message ?? "Sıfırlama bağlantısı gönderildi.");
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Kullanıcı adı ve şifre gereklidir");
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
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Giriş başarısız");
        setLoading(false);
        return;
      }
      // Tam gezinme: erişimi proxy çerezten karar veriyor, router cache'inde ise
      // giriş öncesinden kalan "/admin/[venueId] → login" yönlendirmesi durabiliyor
      window.location.replace(`/admin/${venueId}`);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0f0a18" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[#e91e8c] font-black text-2xl tracking-tight">PlayMyJam</p>
          <p className="text-[#6b7280] text-sm mt-1">
            {mode === "login" ? "Admin Paneli Girişi" : "Şifre Sıfırlama"}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 p-6 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
          {error && (
            <div className="px-4 py-2.5 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          {mode === "forgot" && (
            <p className="text-[#9ca3af] text-xs leading-relaxed">
              Kullanıcı adınızı ya da panele bağladığınız Google adresini girin; o adrese tek
              kullanımlık bir sıfırlama bağlantısı gönderelim.
            </p>
          )}

          {resetSent && (
            <div className="px-4 py-2.5 rounded-xl text-sm text-[#22c55e] bg-green-500/10 border border-green-500/20">
              {resetSent}
            </div>
          )}

          <div>
            <label className="text-xs text-[#9ca3af] mb-1.5 block">Kullanıcı Adı</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && mode === "forgot" && handleForgot()}
              placeholder="neon_admin"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          {mode === "login" && (
          <div>
            <label className="text-xs text-[#9ca3af] mb-1.5 block">Şifre</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <button onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  {showPass ? (
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M9 12a3 3 0 106 0 3 3 0 00-6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  ) : (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
          )}

          <button
            onClick={mode === "login" ? handleLogin : handleForgot}
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: "#e91e8c", color: "white" }}
          >
            {loading
              ? mode === "login"
                ? "Giriş yapılıyor..."
                : "Gönderiliyor..."
              : mode === "login"
                ? "Giriş Yap"
                : "Sıfırlama Bağlantısı Gönder"}
          </button>

          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "forgot" : "login")}
            className="text-xs text-[#9ca3af] hover:text-white transition-colors"
          >
            {mode === "login" ? "Şifremi unuttum" : "Girişe dön"}
          </button>
        </div>
      </div>
    </div>
  );
}
