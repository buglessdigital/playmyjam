"use client";

import { Suspense, use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GOOGLE_ERRORS, GoogleIcon } from "@/components/admin/GoogleAccountCard";

// Yeni açılan mekanların ilk girişte gördüğü zorunlu ekran: kurtarma hesabı
// bağlanana kadar panelin hiçbir yeri açılmıyor (kontrol proxy'de, bkz. 0038).
// Buradan çıkışın iki yolu var — Google hesabı bağlamak veya çıkış yapmak.

interface Props {
  params: Promise<{ venueId: string }>;
}

export default function AdminLinkGooglePage({ params }: Props) {
  return (
    <Suspense>
      <LinkGoogleScreen params={params} />
    </Suspense>
  );
}

function LinkGoogleScreen({ params }: Props) {
  const { venueId } = use(params);
  const searchParams = useSearchParams();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const failure = searchParams.get("google_error");
  const error =
    startError ||
    (failure ? GOOGLE_ERRORS[failure] ?? "Google hesabı bağlanamadı, tekrar deneyin." : "");

  const handleConnect = async () => {
    setStarting(true);
    setStartError("");
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/admin/google/callback`,
        // Yanlış hesapla bağlamayı önlemek için her seferinde hesap seçtir
        queryParams: { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setStartError("Google'a yönlendirilemedi, tekrar deneyin.");
      setStarting(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    window.location.replace(`/admin/${venueId}/login`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0f0a18" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[#e91e8c] font-black text-2xl tracking-tight">PlayMyJam</p>
          <p className="text-[#6b7280] text-sm mt-1">Son Bir Adım</p>
        </div>

        <div
          className="rounded-2xl border border-white/10 p-6 flex flex-col gap-4"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div>
            <p className="text-white text-sm font-semibold">Google Hesabınızı Bağlayın</p>
            <p className="text-[#9ca3af] text-xs mt-2 leading-relaxed">
              Panele devam etmek için bir kurtarma hesabı bağlamanız gerekiyor. Şifrenizi
              unuttuğunuzda sıfırlama bağlantısı yalnızca bu adrese gönderilir; hesap bağlı
              değilse şifrenizi kendiniz sıfırlayamazsınız.
            </p>
            <p className="text-[#6b7280] text-xs mt-2 leading-relaxed">
              Panele giriş yine kullanıcı adı ve şifreyle yapılır — Google yalnızca kurtarma
              için kullanılır.
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleConnect}
            disabled={starting}
            className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70"
            style={{ background: "white", color: "#1f2937" }}
          >
            <GoogleIcon />
            {starting ? "Yönlendiriliyor..." : "Google ile bağla"}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-[#9ca3af] hover:text-white transition-colors"
          >
            Çıkış yap
          </button>
        </div>
      </div>
    </div>
  );
}
