"use client";

import { Suspense, useEffect, useState } from "react";
import GoogleAccountCard, { type AdminAccount } from "@/components/admin/GoogleAccountCard";
import VenueLogoUploader from "@/components/admin/VenueLogoUploader";

const ACCENT = "#e91e8c";

type Settings = {
  name: string;
  request_cost: number;
  priority_cost: number;
  logo_url: string;
  crossfade_ms: number;
};

function CostField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[#9ca3af] text-xs mb-1.5">{label}</label>
      <input
        type="number"
        min="1"
        max="50"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "white",
        }}
      />
      <p className="text-[#6b7280] text-xs mt-1.5">{hint}</p>
    </div>
  );
}

// Şarkı geçişi (crossfade): çalan şarkının son N saniyesinde sıradaki başlar,
// sesler çaprazlanır. 0 = kapalı, sert geçiş.
function CrossfadeField({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[#9ca3af] text-xs">Geçiş süresi</label>
        <span className="text-white text-xs font-semibold tabular-nums">
          {value === 0 ? "Kapalı" : `${(value / 1000).toFixed(1).replace(".0", "")} sn`}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={12000}
        step={500}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Geçiş süresi"
        className="volume-slider w-full cursor-pointer"
        style={{ "--pct": `${(value / 12000) * 100}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-[#6b7280] text-[10px]">
        <span>Kapalı</span>
        <span>12 sn</span>
      </div>
    </div>
  );
}

const inputStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "white",
};

// Şifre alanlarında göz butonu: tıklayınca metin görünür olur
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2M6.6 6.6A18.5 18.5 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.4-.9" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          <path d="M2 2l20 20" />
        </>
      )}
    </svg>
  );
}

function TextField({
  label,
  type,
  value,
  placeholder,
  autoComplete,
  onChange,
}: {
  label: string;
  type: "text" | "password";
  value: string;
  placeholder?: string;
  autoComplete?: string;
  onChange: (v: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label className="block text-[#9ca3af] text-xs mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={isPassword && revealed ? "text" : type}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-xl py-2.5 text-sm outline-none ${
            isPassword ? "pl-3.5 pr-11" : "px-3.5"
          }`}
          style={inputStyle}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Şifreyi gizle" : "Şifreyi göster"}
            title={revealed ? "Şifreyi gizle" : "Şifreyi göster"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#9ca3af] hover:text-white transition-colors"
          >
            <EyeIcon open={revealed} />
          </button>
        )}
      </div>
    </div>
  );
}

// Giriş bilgileri ayrı bir form: mevcut şifre doğrulanmadan değişmez ve
// kaydedildiğinde diğer cihazlardaki oturumlar düşer.
function CredentialsCard({ account, loading }: { account: AdminAccount | null; loading: boolean }) {
  // Kullanıcı alana dokunana kadar sunucudan gelen ad gösterilir
  const [usernameInput, setUsernameInput] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const username = usernameInput ?? account?.username ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError("");

    if (!currentPassword) {
      setError("Mevcut şifrenizi girin");
      return;
    }
    if (newPassword && newPassword !== newPassword2) {
      setError("Yeni şifreler eşleşmiyor");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newUsername: username, newPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      setUsernameInput(data?.username ?? username);
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
      <div
        className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4"
        style={{ background: "rgba(255,255,255,0.03)" }}
      >
        <div>
          <p className="text-white text-sm font-semibold">Giriş Bilgileri</p>
          <p className="text-[#6b7280] text-xs mt-1">
            Panel giriş kullanıcı adınızı ve şifrenizi buradan değiştirebilirsiniz. Kaydettiğinizde
            diğer cihazlardaki oturumlar (mekan ekranı dahil) kapanır; oralarda yeni bilgilerle
            tekrar giriş yapmanız gerekir.
          </p>
        </div>

        <TextField
          label="Kullanıcı adı"
          type="text"
          value={username}
          autoComplete="username"
          onChange={setUsernameInput}
        />

        <TextField
          label="Mevcut şifre"
          type="password"
          value={currentPassword}
          placeholder="Doğrulama için gerekli"
          autoComplete="current-password"
          onChange={setCurrentPassword}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Yeni şifre"
            type="password"
            value={newPassword}
            placeholder="Değiştirmeyecekseniz boş bırakın"
            autoComplete="new-password"
            onChange={setNewPassword}
          />
          <TextField
            label="Yeni şifre (tekrar)"
            type="password"
            value={newPassword2}
            autoComplete="new-password"
            onChange={setNewPassword2}
          />
        </div>

        <p className="text-[#6b7280] text-xs">Şifre en az 8 karakter olmalı.</p>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={saving || loading}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-70"
        style={{
          background: saved ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
          color: saved ? "#22c55e" : "white",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        {saved ? "Giriş bilgileri güncellendi!" : saving ? "Kaydediliyor..." : "Giriş Bilgilerini Güncelle"}
      </button>
    </form>
  );
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [account, setAccount] = useState<AdminAccount | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [requestCost, setRequestCost] = useState("1");
  const [priorityCost, setPriorityCost] = useState("2");
  const [logoUrl, setLogoUrl] = useState("");
  const [crossfadeMs, setCrossfadeMs] = useState(4000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Settings) => {
        setSettings(s);
        setRequestCost(String(s.request_cost));
        setPriorityCost(String(s.priority_cost));
        setLogoUrl(s.logo_url ?? "");
        setCrossfadeMs(s.crossfade_ms ?? 4000);
      })
      .catch(() => setError("Ayarlar yüklenemedi"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/admin/credentials")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((a: AdminAccount) => setAccount(a))
      .catch(() => setAccount(null))
      .finally(() => setAccountLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestCost: Number(requestCost),
          priorityCost: Number(priorityCost),
          logoUrl: logoUrl.trim(),
          crossfadeMs,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Kaydedilemedi");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Bağlantı hatası, tekrar deneyin");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-[#6b7280] text-sm">Yükleniyor...</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Ayarlar</h1>
        <p className="text-[#6b7280] text-sm mt-0.5">{settings?.name ?? ""}</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div
          className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-white text-sm font-semibold">Mekan Logosu</p>
            <p className="text-[#6b7280] text-xs mt-1">
              Mekan listelerinde adınızın yanında görünür. Logo yüklemezseniz mekan adınızın baş
              harfi gösterilir. Seçtiğiniz görsel anında kaydedilir.
            </p>
          </div>

          <VenueLogoUploader
            venueName={settings?.name ?? ""}
            logoUrl={logoUrl}
            onChange={setLogoUrl}
            accent={ACCENT}
          />
        </div>

        <div
          className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-white text-sm font-semibold">Şarkı İstek Ücreti</p>
            <p className="text-[#6b7280] text-xs mt-1">
              Mekanınızda bir şarkı çaldırmanın jeton maliyeti. Jeton fiyatı tüm mekanlarda aynıdır;
              burada sadece bir istek için kaç jeton harcanacağını belirlersiniz.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CostField
              label="Normal istek (jeton)"
              hint="Sıranın sonuna eklenir"
              value={requestCost}
              onChange={setRequestCost}
            />
            <CostField
              label="Öncelikli istek (jeton)"
              hint="Sıranın başına geçer"
              value={priorityCost}
              onChange={setPriorityCost}
            />
          </div>

          <p className="text-[#6b7280] text-xs">
            Varsayılan: normal 1 jeton, öncelikli 2 jeton. Değişiklik yalnızca bundan sonraki
            isteklere uygulanır.
          </p>
        </div>

        <div
          className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-white text-sm font-semibold">Şarkı Geçişi (Crossfade)</p>
            <p className="text-[#6b7280] text-xs mt-1">
              Çalan şarkının son saniyelerinde sıradaki şarkı başlar; çıkanın sesi yavaşça iner,
              girenin sesi yükselir. Şarkılar arasında sessizlik kalmaz.
            </p>
          </div>

          <CrossfadeField value={crossfadeMs} onChange={setCrossfadeMs} />

          <p className="text-[#6b7280] text-xs">
            Panelden &quot;sonraki&quot;ye basıldığında geçiş yapılmaz, şarkı anında değişir. Çok kısa
            şarkılarda geçiş otomatik atlanır. Player&apos;ı tablet/telefonda açtıysanız bu özellik
            çalışmaz — o cihazlarda tarayıcı ses seviyesini uygulamaya bırakmaz.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-70"
          style={{
            background: saved ? "rgba(34,197,94,0.15)" : ACCENT,
            color: saved ? "#22c55e" : "white",
          }}
        >
          {saved ? "Kaydedildi!" : saving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
        </button>
      </form>

      <Suspense fallback={null}>
        <GoogleAccountCard account={account} loading={accountLoading} />
      </Suspense>

      <CredentialsCard account={account} loading={accountLoading} />
    </div>
  );
}
