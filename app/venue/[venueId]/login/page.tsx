"use client";

import { useState, useEffect, use, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/venue-gate";
import { isGuestAccount } from "@/lib/guest-session";
import { useRedirectPending } from "@/lib/use-redirect-pending";
import { currentDict, fmt, useT } from "@/lib/i18n";
import ConsentChecks, { EMPTY_CONSENTS } from "@/components/ui/ConsentChecks";

function authErrorMessage(code: string): string {
  const d = currentDict().login;
  const map: Record<string, string> = {
    oauth_failed: d.errOauth,
    confirm_failed: d.errConfirmFailed,
    confirm_invalid: d.errConfirmInvalid,
    missing_params: d.errMissingParams,
  };
  return map[code] ?? d.errMissingParams;
}

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
  const searchParams = useSearchParams();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Google'a gidip giriş yapmadan geri dönülürse düğme kilitli kalmasın
  const [googleLoading, setGoogleLoading] = useRedirectPending();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [existingUser, setExistingUser] = useState<{ name: string } | null>(null);
  // Misafir: var olan bir hesaba giriş yaparsa anonim kimlikteki cüzdan geride kalır
  const [isGuest, setIsGuest] = useState(false);
  const [continueLoading, setContinueLoading] = useState(false);
  const [consents, setConsents] = useState(EMPTY_CONSENTS);
  const t = useT();

  // Hesap gerektiren bir eylem buraya yönlendirdiyse giriş sonrası oraya dönülür
  const nextPath = safeNextPath(searchParams.get("next"), venueId);

  // Callback/confirm route'larından gelen hata kodunu göster, URL'den temizle
  useEffect(() => {
    const code = searchParams.get("auth_error");
    if (code) {
      setError(authErrorMessage(code));
      const next = searchParams.get("next");
      router.replace(next ? `/venue/${venueId}/login?next=${encodeURIComponent(next)}` : `/venue/${venueId}/login`);
    }
  }, [searchParams, router, venueId]);

  // Başka mekanda açılmış oturum varsa tek dokunuşla bu mekana da girilebilsin
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const supabase = createClient();
      // getSession lokal cache'ten okur — ağ çağrısı yok
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (cancelled || !user) return;
      // Misafir buraya hesabını BAĞLAMAYA geldi: "devam et" onu geldiği yere
      // geri atar ve akış kapanır. Onun yerine kayıt formu açılır.
      if (user.is_anonymous) {
        setIsGuest(true);
        setIsLogin(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const name = profile?.username || user.email?.split("@")[0] || currentDict().login.defaultName;
      setExistingUser({ name });
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mekan çerezini kur ve gelinen sayfaya geç. Yumuşak geçiş (router.push) burada
  // kullanılamıyor: erişimi proxy çerezten karar veriyor, client router cache'inde
  // ise giriş öncesinden kalmış "misafir" kaydı durabiliyor. O kayıt servis
  // edildiğinde sayfa hesabı yokmuş gibi davranıyordu. Tam gezinme cache'i
  // baypas eder; kabuk zaten prefetch'li olduğu için maliyeti düşük.
  const enterVenue = async (): Promise<"ok" | "unauthorized" | "network"> => {
    let needsConsent = false;
    try {
      const res = await fetch(`/api/venue/${venueId}/auth`, { method: "POST" });
      if (!res.ok) {
        setError(t.login.errSessionCheck);
        return "unauthorized";
      }
      // Onayı eksik hesap (Google ile açılmış ya da bu ekrandan geçmemiş)
      // önce onay ekranına uğrar
      needsConsent = ((await res.json()) as { needsConsent?: boolean }).needsConsent === true;
    } catch {
      setError(t.login.errConnection);
      return "network";
    }
    window.location.replace(
      needsConsent ? `/venue/${venueId}/onay?next=${encodeURIComponent(nextPath)}` : nextPath
    );
    return "ok";
  };

  const handleContinue = async () => {
    setContinueLoading(true);
    setError("");
    setInfo("");
    const result = await enterVenue();
    if (result === "ok") return;
    setContinueLoading(false);
    // Bayat/geçersiz oturum: butonu kaldır, form kullanılabilir kalsın
    if (result === "unauthorized") setExistingUser(null);
  };

  const emailRedirectTo = () => `${window.location.origin}${nextPath}`;

  const handleResend = async () => {
    setResendLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    setResendLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429")) {
        setError(t.login.errTooMany);
      } else {
        setError(t.login.errResend);
      }
      return;
    }
    setShowResend(false);
    setInfo(fmt(t.login.infoResent, { email }));
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setInfo("");
      setShowResend(false);
      setError(t.login.errEmailFirst);
      return;
    }
    setResetLoading(true);
    setError("");
    setInfo("");
    setShowResend(false);
    const supabase = createClient();
    // PKCE yönlendirmesi redirectTo'nun sorgu kısmını ezip venueId'yi düşürebiliyor;
    // /auth/reset mekanı bu çerezden de okuyabilsin (Google akışındaki desenin aynısı)
    document.cookie = `pmj_reset_venue=${venueId}; path=/; max-age=3600; samesite=lax`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset?venueId=${venueId}`,
    });
    setResetLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("429")) {
        setError(t.login.errTooMany);
      } else {
        setError(t.login.errReset);
      }
      return;
    }
    // Kayıtlı olmayan adres için de aynı mesaj: hangi e-postaların kayıtlı
    // olduğu dışarıdan anlaşılmasın.
    setInfo(
      `${email.trim()} adresi kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Bağlantıyı bu cihazda açman gerekiyor.`
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setInfo("");
    setShowResend(false);
    try {
      await submitCredentials();
    } catch {
      // Ağ hatası vb. yakalanmazsa buton sonsuza dek "Bekle..." kalıyor
      setError(t.login.errConnection);
      setLoading(false);
    }
  };

  const submitCredentials = async () => {
    const supabase = createClient();

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const msg = error.message.toLowerCase();
        if (error.code === "email_not_confirmed" || msg.includes("email not confirmed")) {
          setError(t.login.errNotConfirmed);
          setShowResend(true);
        } else {
          setError(t.login.errBadCredentials);
        }
        setLoading(false);
        return;
      }
    } else {
      // Misafir olarak başlamış biri kayıt oluyorsa YENİ hesap açılmaz, mevcut
      // anonim hesap kalıcıya çevrilir (bkz. lib/guest-session.ts) — yoksa
      // cüzdanındaki jetonlar eski kimlikte kalırdı.
      if (await isGuestAccount()) {
        const { error } = await supabase.auth.updateUser(
          {
            email,
            password,
            data: {
              kvkk_consent: true,
              terms_consent: true,
              marketing_consent: consents.marketing,
            },
          },
          { emailRedirectTo: emailRedirectTo() }
        );
        if (error) {
          const msg = error.message.toLowerCase();
          setError(
            msg.includes("already") || msg.includes("registered")
              ? t.login.errAlreadyRegistered
              : msg.includes("password") && msg.includes("short")
              ? t.login.errShortPassword
              : msg.includes("invalid email")
              ? t.login.errInvalidEmail
              : t.login.errSignup
          );
          setLoading(false);
          return;
        }
        // Adres doğrulanana kadar oturum misafir kimliğiyle devam eder; jetonlar
        // ve geçmiş yerinde kalır, doğrulamayla birlikte hesap kalıcı olur.
        setInfo(fmt(t.login.infoLinkEmail, { email }));
        setLoading(false);
        return;
      }

      // Onaylar kayıt metadata'sına yazılır: e-posta onayı beklenirken oturum
      // açılmadığı için profile ancak buradan taşınabiliyor (0043).
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: emailRedirectTo(),
          data: {
            kvkk_consent: true,
            terms_consent: true,
            marketing_consent: consents.marketing,
          },
        },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("rate limit") || msg.includes("too many") || msg.includes("20 seconds") || msg.includes("429")) {
          setError(t.login.errTooMany);
        } else if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
          setError(t.login.errAlreadyRegistered);
        } else if (msg.includes("password") && msg.includes("short")) {
          setError(t.login.errShortPassword);
        } else if (msg.includes("invalid email")) {
          setError(t.login.errInvalidEmail);
        } else {
          setError(t.login.errSignup);
        }
        setLoading(false);
        return;
      }
      // Zaten kayıtlı adres: Supabase kullanıcı sızıntısını önlemek için hata
      // yerine sahte bir kullanıcı döner (identities boş) ve HİÇBİR e-posta
      // göndermez. Yakalamazsak ekran "onay maili gönderildi" der, mail hiç
      // gelmez ve kullanıcı sıkışır.
      if (signUpData.user && (signUpData.user.identities?.length ?? 0) === 0) {
        setError(t.login.errAlreadyRegistered);
        setLoading(false);
        setIsLogin(true);
        return;
      }

      // Email confirmation enabled: session is null until user confirms
      if (!signUpData.session) {
        setError("");
        setLoading(false);
        setInfo(fmt(t.login.infoSignup, { email }));
        setIsLogin(true);
        return;
      }
    }

    if ((await enterVenue()) !== "ok") setLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError("");
    setInfo("");
    setShowResend(false);
    const supabase = createClient();
    document.cookie = `pending_oauth_venue=${venueId}; path=/; max-age=600; samesite=lax`;
    // Google akışında onaylar user_metadata'ya yazılamıyor (metadata Google'dan
    // geliyor); kutulardaki seçim çerezle taşınır, /auth/callback damgalar.
    if (!isLogin) {
      document.cookie = `pending_consent=1; path=/; max-age=600; samesite=lax`;
      document.cookie = `pending_consent_marketing=${consents.marketing ? 1 : 0}; path=/; max-age=600; samesite=lax`;
    }
    // Google dönüşünde sorgu parametresi PKCE tarafından ezilebiliyor — hedef yol çerezle de taşınır
    document.cookie = `pending_oauth_next=${encodeURIComponent(nextPath)}; path=/; max-age=600; samesite=lax`;
    const oauthOptions = {
      redirectTo: `${window.location.origin}/auth/callback?venueId=${venueId}&next=${encodeURIComponent(nextPath)}`,
    };
    // Misafir kimliği varsa Google hesabı ONA bağlanır: yeni kullanıcı açılsaydı
    // cüzdan ve geçmiş eski kimlikte kalırdı (bkz. lib/guest-session.ts).
    const { error } = (await isGuestAccount())
      ? await supabase.auth.linkIdentity({ provider: "google", options: oauthOptions })
      : await supabase.auth.signInWithOAuth({ provider: "google", options: oauthOptions });
    if (error) {
      setError(t.login.errGoogleStart);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0f0a18] max-w-md mx-auto relative overflow-hidden">
      <div className="relative h-56 w-full overflow-hidden">
        {/* Yerel görsel: external CDN'e gitmez, service worker cache'ler */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/login-hero.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#0f0a18]" />
        <div className="absolute top-4 left-1/2 -translate-x-1/2">
          <span className="text-white font-bold text-lg tracking-wide">PlayMyJam</span>
        </div>
      </div>

      <div className="flex-1 px-6 pt-2 pb-10">
        <h1 className="text-3xl font-bold text-white leading-tight mb-1">
          {t.login.headingLead} <span className="text-[#e91e8c]">{t.login.headingAccent}</span>
        </h1>
        <p className="text-[#9ca3af] text-sm mb-8">
          {t.login.sub}
        </p>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
            {error}
            {showResend && (
              <button
                onClick={handleResend}
                disabled={resendLoading}
                className="block mt-2 font-semibold text-white underline underline-offset-2 disabled:opacity-50"
              >
                {resendLoading ? t.login.sending : t.login.resendConfirm}
              </button>
            )}
          </div>
        )}

        {info && (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
            {info}
          </div>
        )}

        {/* Mevcut oturumla tek dokunuşla devam */}
        {existingUser && (
          <>
            <button
              onClick={handleContinue}
              disabled={continueLoading || loading || googleLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white text-base transition-all active:scale-95 disabled:opacity-50 mb-4"
              style={{ background: "linear-gradient(135deg, #e91e8c, #c2185b)" }}
            >
              {continueLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="7" r="4" stroke="white" strokeWidth="2" />
                </svg>
              )}
              {continueLoading ? t.login.continuing : fmt(t.login.continueAs, { name: existingUser.name })}
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs text-[#4b5563]">{t.login.orDifferentAccount}</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          </>
        )}

        {/* Kayıt onayları: kayıt eylemiyle kabul edilir, sözleşmelere bağlantı verir */}
        {!isLogin && (
          <div className="mb-4">
            <ConsentChecks value={consents} onChange={setConsents} />
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
          {googleLoading ? t.login.redirecting : t.login.continueWithGoogle}
        </button>

        {/* Ayraç */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-[#4b5563]">{t.login.orWithEmail}</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Misafirken var olan bir hesaba giriş: Supabase iki kimliği birleştiremiyor,
            anonim cüzdan geride kalır. Google düğmesi linkIdentity kullandığı için
            (bkz. handleGoogle) bu uyarı yalnızca e-posta+şifre girişine ait. */}
        {isGuest && isLogin && (
          <div className="mb-4 px-4 py-2.5 rounded-xl text-xs leading-relaxed text-amber-300/90 bg-amber-500/10 border border-amber-500/20">
            {t.login.guestSignInWarn}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#9ca3af] mb-1.5 block">{t.login.email}</label>
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
              <label className="text-xs text-[#9ca3af]">{t.login.password}</label>
              {isLogin && (
                <button
                  onClick={handleForgotPassword}
                  disabled={resetLoading || loading || googleLoading}
                  className="text-xs text-[#e91e8c] font-semibold disabled:opacity-50"
                >
                  {resetLoading ? t.login.sending : t.login.forgotPassword}
                </button>
              )}
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
                placeholder={t.login.passwordPlaceholder}
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
            {loading ? t.login.wait : isLogin ? t.login.signIn : t.login.signUp}
          </button>

          <button
            onClick={() => { setIsLogin(!isLogin); setError(""); setInfo(""); setShowResend(false); }}
            className="w-full text-center py-3.5 rounded-2xl font-semibold text-white text-base border border-white/10 bg-white/5 hover:bg-white/10 transition-all"
          >
            {isLogin ? t.login.switchToSignUp : t.login.switchToSignIn}
          </button>

          <Link
            href={`/venue/${venueId}/browse`}
            className="block w-full text-center py-2 text-sm font-semibold text-[#9ca3af]"
          >
            {t.login.justLooking}
          </Link>
        </div>
      </div>
    </div>
  );
}
