"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// Maildeki sıfırlama bağlantısının indiği sayfa. Yol /login altında olduğu için
// proxy'de giriş gerektirmiyor (bkz. proxy.ts admin route koruması).

interface Props {
  params: Promise<{ venueId: string }>;
}

type Phase = "checking" | "form" | "invalid" | "done";

const MIN_PASSWORD = 8;

export default function AdminResetPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <AdminResetForm params={params} />
    </Suspense>
  );
}

function AdminResetForm({ params }: Props) {
  const { venueId } = use(params);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [phase, setPhase] = useState<Phase>(token ? "checking" : "invalid");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(
    token ? "" : "Bağlantı geçersiz. Giriş ekranından yeni bir bağlantı isteyin."
  );

  // Token'ı önce doğrula: süresi geçmiş bağlantıda kullanıcıyı boş yere
  // şifre yazdırmayalım
  useEffect(() => {
    if (!token) return;
    let active = true;
    fetch(`/api/admin/password-reset/confirm?token=${encodeURIComponent(token)}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => null) }))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok || !data?.valid) {
          setPhase("invalid");
          setError(data?.error ?? "Bağlantı geçersiz veya süresi dolmuş.");
          return;
        }
        setUsername(data.username ?? "");
        setPhase("form");
      })
      .catch(() => {
        if (active) {
          setPhase("invalid");
          setError("Bağlantı doğrulanamadı, tekrar deneyin.");
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async () => {
    if (password.length < MIN_PASSWORD) {
      setError(`Şifre en az ${MIN_PASSWORD} karakter olmalı`);
      return;
    }
    if (password !== password2) {
      setError("Şifreler eşleşmiyor");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Şifre güncellenemedi");
        return;
      }
      setPhase("done");
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0f0a18" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[#e91e8c] font-black text-2xl tracking-tight">PlayMyJam</p>
          <p className="text-[#6b7280] text-sm mt-1">Yeni Şifre Belirle</p>
        </div>

        <div
          className="rounded-2xl border border-white/10 p-6 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          {error && (
            <div className="px-4 py-2.5 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          {phase === "checking" && <p className="text-[#6b7280] text-sm">Bağlantı kontrol ediliyor...</p>}

          {phase === "invalid" && (
            <a
              href={`/admin/${venueId}/login`}
              className="w-full py-3 rounded-xl text-sm font-semibold text-center"
              style={{ background: "#e91e8c", color: "white" }}
            >
              Giriş ekranına dön
            </a>
          )}

          {phase === "done" && (
            <>
              <p className="text-[#22c55e] text-sm">
                Şifreniz güncellendi. Açık olan tüm oturumlar (mekan ekranı dahil) kapatıldı; yeni
                şifrenizle tekrar giriş yapın.
              </p>
              <a
                href={`/admin/${venueId}/login`}
                className="w-full py-3 rounded-xl text-sm font-semibold text-center"
                style={{ background: "#e91e8c", color: "white" }}
              >
                Giriş Yap
              </a>
            </>
          )}

          {phase === "form" && (
            <>
              {username && (
                <p className="text-[#9ca3af] text-xs">
                  Hesap: <span className="text-white">{username}</span>
                </p>
              )}

              <div>
                <label className="text-xs text-[#9ca3af] mb-1.5 block">Yeni şifre</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white outline-none"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] text-xs"
                  >
                    {showPass ? "Gizle" : "Göster"}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#9ca3af] mb-1.5 block">Yeni şifre (tekrar)</label>
                <input
                  type={showPass ? "text" : "password"}
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: "#e91e8c", color: "white" }}
              >
                {saving ? "Kaydediliyor..." : "Şifreyi Güncelle"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
