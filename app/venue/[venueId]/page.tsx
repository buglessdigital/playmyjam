"use client";

import { useState, use, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function AuthPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <AuthPageContent params={params} />
    </Suspense>
  );
}

function AuthPageContent({ params }: Props) {
  const { venueId } = use(params);
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError("E-posta veya şifre hatalı"); setLoading(false); return; }
    } else {
      const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("20 seconds") || msg.includes("429")) {
          setError("Çok fazla deneme yapıldı. Lütfen birkaç saniye bekleyip tekrar deneyin.");
        } else if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
          setError("Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin.");
        } else if (msg.includes("password") && msg.includes("short")) {
          setError("Şifre en az 6 karakter olmalıdır.");
        } else if (msg.includes("invalid email")) {
          setError("Geçersiz e-posta adresi.");
        } else {
          setError("Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.");
        }
        setLoading(false);
        return;
      }
      // Email confirmation enabled: session is null until user confirms
      if (!signUpData.session) {
        setError("");
        setLoading(false);
        alert(`${email} adresine bir onay e-postası gönderildi. Lütfen e-postanızı kontrol edip bağlantıya tıklayın, ardından giriş yapın.`);
        setIsLogin(true);
        return;
      }
    }

    await fetch(`/api/venue/${venueId}/auth`, { method: "POST" });
    router.push(`/venue/${venueId}/queue`);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError("");
    const supabase = createClient();
    document.cookie = `pending_oauth_venue=${venueId}; path=/; max-age=600; samesite=lax`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?venueId=${venueId}`,
      },
    });
    if (error) {
      setError("Google ile giriş başlatılamadı. Lütfen tekrar deneyin.");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f0a18] max-w-md mx-auto relative overflow-hidden">
      <div className="relative h-56 w-full overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0f0a18]" />
        <div className="absolute top-4 left-1/2 -translate-x-1/2">
          <span className="text-white font-bold text-lg tracking-wide">PlayMyJam</span>
        </div>
      </div>

      <div className="flex-1 px-6 pt-2 pb-10">
        <h1 className="text-3xl font-bold text-white leading-tight mb-1">
          Hadi partiyi <span className="text-[#e91e8c]">başlatalım</span>
        </h1>
        <p className="text-[#9ca3af] text-sm mb-8">
          Favori parçalarını sıraya koy ve mekanda bir sonraki çalacak şarkıyı oyla.
        </p>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}

        {/* Google butonu */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold text-white text-base border border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50 mb-4"
        >
          {googleLoading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          {googleLoading ? "Yönlendiriliyor..." : "Google ile devam et"}
        </button>

        {/* Ayraç */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-[#4b5563]">veya e-posta ile</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#9ca3af] mb-1.5 block">E-posta</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="4" width="20" height="16" rx="3" stroke="#6b7280" strokeWidth="1.5" />
                  <path d="M2 8l10 6 10-6" stroke="#6b7280" strokeWidth="1.5" />
                </svg>
              </div>
              <input
                type="email"
                placeholder="merhaba@ornek.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#1a0e2a] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/50 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs text-[#9ca3af]">Şifre</label>
            </div>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="10" width="14" height="11" rx="2" stroke="#6b7280" strokeWidth="1.5" />
                  <path d="M8 10V7a4 4 0 018 0v3" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Şifrenizi girin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full bg-[#1a0e2a] border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#e91e8c]/50 transition-colors"
              />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  {showPassword ? (
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M9 12a3 3 0 106 0 3 3 0 00-6 0" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
                  ) : (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M3 3l18 18" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="block w-full text-center py-3.5 rounded-2xl font-bold text-white text-base mt-2 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
          >
            {loading ? "Bekle..." : isLogin ? "Giriş Yap →" : "Kayıt Ol →"}
          </button>

          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); }}
            className="w-full text-center py-3.5 rounded-2xl font-semibold text-white text-base border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
          >
            {isLogin ? "Kayıt Ol" : "Giriş Yap"}
          </button>
        </div>
      </div>
    </div>
  );
}
