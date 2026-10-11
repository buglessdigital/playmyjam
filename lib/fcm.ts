import { createSign } from "node:crypto";

// Firebase Cloud Messaging (HTTP v1) — mağaza uygulamasının Android push'u.
//
// Kimlik: Firebase Admin servis hesabı, FIREBASE_SERVICE_ACCOUNT_B64 env'inde
// (JSON'un base64'ü; Vercel'de "sensitive"). Anahtar yoksa FCM sessizce kapalı —
// web push gibi kritik yol değil. firebase-admin paketi BİLEREK eklenmedi:
// tek ihtiyaç bir OAuth erişim jetonu ve tek bir HTTP isteği.

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let account: ServiceAccount | null | undefined;
let cachedToken: { value: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  try {
    const parsed = raw ? (JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount) : null;
    account = parsed?.project_id && parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    console.error("[fcm] FIREBASE_SERVICE_ACCOUNT_B64 çözülemedi");
    account = null;
  }
  return account;
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

// Servis hesabıyla imzalı JWT → Google OAuth erişim jetonu (1 saat; 5 dk payla önbellekte)
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 300 > now) return cachedToken.value;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key);
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !data?.access_token) {
    throw new Error(`FCM erişim jetonu alınamadı (${res.status})`);
  }
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

export type FcmMessage = {
  title: string;
  body?: string;
  /** Dokununca açılacak site içi yol (uygulamada WebView'de açılır) */
  url?: string;
  tag?: string;
  data?: Record<string, string>;
  ttlSeconds: number;
};

export type FcmResult = { ok: true } | { ok: false; expired: boolean; error: string };

export async function sendFcm(token: string, msg: FcmMessage): Promise<FcmResult> {
  const sa = serviceAccount();
  if (!sa) return { ok: false, expired: false, error: "FCM yapılandırılmamış" };

  let bearer: string;
  try {
    bearer = await accessToken(sa);
  } catch (err) {
    return { ok: false, expired: false, error: (err as Error).message };
  }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, ...(msg.body ? { body: msg.body } : {}) },
        // FCM data alanında yalnızca metin olur
        data: { ...(msg.data ?? {}), ...(msg.url ? { url: msg.url } : {}) },
        // Talep onayının 10 dk'lık penceresi var: ekran kapalıyken de hemen düşsün
        android: {
          priority: "HIGH",
          ttl: `${msg.ttlSeconds}s`,
          ...(msg.tag ? { notification: { tag: msg.tag } } : {}),
        },
      },
    }),
  });
  if (res.ok) return { ok: true };

  const body = (await res.json().catch(() => null)) as {
    error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
  } | null;
  const code = body?.error?.details?.find((d) => d.errorCode)?.errorCode ?? body?.error?.status ?? "";
  // Uygulama silinmiş / kod yenilenmiş: satır silinmeli
  const expired = res.status === 404 || code === "UNREGISTERED";
  return {
    ok: false,
    expired,
    error: `FCM ${res.status} ${code}${body?.error?.message ? `: ${body.error.message.slice(0, 120)}` : ""}`,
  };
}
