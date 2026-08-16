"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRedirectPending } from "@/lib/use-redirect-pending";

// Mekan admininin kurtarma hesabı. Google'dan dönen adres doğrulanmış sayılır;
// "şifremi unuttum" bağlantısı yalnızca buraya gider — bağlı hesap yoksa
// sıfırlama da yapılamaz.

export const GOOGLE_ERRORS: Record<string, string> = {
  denied: "Google izni verilmedi, hesap bağlanmadı.",
  missing_code: "Google'dan dönüş tamamlanmadı, tekrar deneyin.",
  oauth_failed: "Google doğrulaması tamamlanamadı, tekrar deneyin.",
  no_email: "Google hesabından e-posta alınamadı.",
  in_use: "Bu Google hesabı başka bir mekana bağlı.",
  save_failed: "Hesap kaydedilemedi, tekrar deneyin.",
};

export interface AdminAccount {
  username: string;
  googleEmail: string | null;
  googleLinkedAt: string | null;
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.14-2.65-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 16.3 4 9.7 8.35 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C37 41.2 44 36 44 24c0-1.3-.14-2.65-.4-3.9z" />
    </svg>
  );
}

export default function GoogleAccountCard({
  account,
  loading,
}: {
  account: AdminAccount | null;
  loading: boolean;
}) {
  const searchParams = useSearchParams();
  // Google'a gidip bağlamadan geri dönülürse düğme kilitli kalmasın
  const [starting, setStarting] = useRedirectPending();
  const [startError, setStartError] = useState("");

  // Callback sonucu sorgu parametresiyle dönüyor; tam sayfa gezinmesi olduğu
  // için bağlı hesap bilgisi zaten taze yükleniyor
  const failure = searchParams.get("google_error");
  const justLinked = searchParams.get("google") === "linked";
  const error =
    startError || (failure ? GOOGLE_ERRORS[failure] ?? "Google hesabı bağlanamadı, tekrar deneyin." : "");

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

  const linked = Boolean(account?.googleEmail);

  return (
    <div
      className="rounded-2xl border border-white/10 p-5 flex flex-col gap-4 mt-4"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div>
        <p className="text-white text-sm font-semibold">Kurtarma Hesabı (Google)</p>
        <p className="text-[#6b7280] text-xs mt-1">
          Google hesabınızı bağlayın; şifrenizi unuttuğunuzda sıfırlama bağlantısı bu adrese
          gönderilir. Panele giriş yine kullanıcı adı ve şifreyle yapılır.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm text-red-400 bg-red-500/10 border border-red-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[#6b7280] text-sm">Yükleniyor...</p>
      ) : linked ? (
        <>
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
          >
            <GoogleIcon />
            <div className="min-w-0">
              <p className="text-white text-sm truncate">{account?.googleEmail}</p>
              <p className="text-[#22c55e] text-xs mt-0.5">
                {justLinked ? "Hesap bağlandı ve doğrulandı" : "Bağlı ve doğrulanmış"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={starting}
            className="self-start text-xs text-[#9ca3af] underline underline-offset-4 disabled:opacity-60"
          >
            {starting ? "Yönlendiriliyor..." : "Başka bir Google hesabı bağla"}
          </button>
        </>
      ) : (
        <>
          <div
            className="rounded-xl px-4 py-3 text-xs text-amber-300"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            Henüz bağlı hesap yok. Bağlamadan şifrenizi unutursanız sıfırlama bağlantısı
            gönderemeyiz.
          </div>
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
        </>
      )}
    </div>
  );
}
