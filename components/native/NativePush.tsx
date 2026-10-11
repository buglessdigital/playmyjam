"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { deepLinkToPath, nativePlatform, nativePlugins } from "@/lib/native-app";

// Mağaza uygulamasında işletim sistemi bildirimleri (0077, lib/fcm.ts).
//
// Web push WebView'de çalışmıyor; burada @capacitor/push-notifications ile
// cihaz kodu alınıp /api/push/native'e kaydedilir. Sunucu müşteri
// bildirimlerini (şarkın çalıyor, talep onaylandı…) bu koda da yollar.
//
// İzin, hesap açılınca bir kez sorulur (misafir dahil — talep onayı ona da
// gider). Kod oturumdan önce gelirse bekletilir, oturum açılınca gönderilir.
// Bildirime dokununca yükteki `url` WebView'de açılır.

export default function NativePush() {
  const router = useRouter();

  useEffect(() => {
    const platform = nativePlatform();
    const push = nativePlugins()?.PushNotifications;
    if (!platform || !push) return;

    let token: string | null = null;
    let signedIn = false;
    let asked = false;
    let lastSent: string | null = null;
    const listeners: { remove: () => unknown }[] = [];

    const sendToken = async () => {
      if (!token || !signedIn) return;
      // Aynı kod aynı kullanıcıya tekrar tekrar yollanmasın; kullanıcı
      // değişince (onAuthStateChange) lastSent sıfırlanır
      if (lastSent === token) return;
      try {
        const res = await fetch("/api/push/native", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform }),
        });
        if (res.ok) lastSent = token;
      } catch {
        // Bir sonraki açılışta yeniden denenir
      }
    };

    const askAndRegister = async () => {
      if (asked) return;
      asked = true;
      try {
        let { receive } = await push.checkPermissions();
        if (receive === "prompt" || receive === "prompt-with-rationale") {
          ({ receive } = await push.requestPermissions());
        }
        if (receive === "granted") await push.register();
      } catch {
        // İzin penceresi açılamadı: bildirim yok, uygulama çalışmaya devam eder
      }
    };

    void push.addListener("registration", ({ value }) => {
      token = value;
      void sendToken();
    }).then((l) => listeners.push(l));
    void push
      .addListener("pushNotificationActionPerformed", ({ notification }) => {
        const url = typeof notification.data?.url === "string" ? notification.data.url : null;
        // Yük yalnızca site içi yol taşır; yine de mutlak adres gelirse süzgeçten geçsin
        const path = url?.startsWith("/") && !url.startsWith("//") ? url : url ? deepLinkToPath(url) : null;
        if (path) router.push(path);
      })
      .then((l) => listeners.push(l));

    const supabase = createClient();
    const onSession = (hasSession: boolean) => {
      signedIn = hasSession;
      if (!hasSession) return;
      void askAndRegister();
      void sendToken();
    };
    void (async () => {
      const { data } = await supabase.auth.getClaims();
      onSession(!!data?.claims.sub);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      // Hesap değişti (misafir → kayıtlı, başka hesaba giriş): kod yeni kullanıcıya taşınsın
      if (event === "SIGNED_IN" || event === "USER_UPDATED") lastSent = null;
      onSession(!!session);
    });

    return () => {
      sub.subscription.unsubscribe();
      for (const l of listeners) void l.remove();
    };
  }, [router]);

  return null;
}
