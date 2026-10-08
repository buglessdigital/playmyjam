import { createHash, randomBytes } from "node:crypto";
import { signSession, verifySession, type AppGiftNonce } from "@/lib/session";

// Mobil uygulamaya geçene hediye jeton — cihaz doğrulaması (0076).
//
// "Cihaz başına bir kez" kuralı istemcinin söylediği bir kimliğe güvenemez:
// herkes rastgele kimlik uydurup ucu tekrar tekrar çağırırdı. Kimliği, mağaza
// platformunun imzaladığı bir kanıttan SUNUCU çıkarır:
//   * iOS: App Attest (uygulamanın gerçek ve değiştirilmemiş olduğu) +
//     DeviceCheck (cihaza bağlı, yeniden kurulumda silinmeyen 2 bit)
//   * Android: Play Integrity (gerçek uygulama, gerçek cihaz) + cihaz anahtarı
//
// Aşama 1'de doğrulayıcılar YOK — hesaplar (Apple Team ID, Play Console)
// açılınca Aşama 3'te eklenecek. O zamana kadar FAIL-CLOSED: hiçbir kanıt
// kabul edilmez, hediye kimseye verilmez. Bu bilinçli: doğrulamasız bir uç
// açıldığı gün jeton fabrikasına dönerdi.

export type DevicePlatform = "ios" | "android";

const NONCE_TTL_SECONDS = 5 * 60;

export function issueGiftNonce(userId: string): string {
  return signSession({
    kind: "app_gift",
    user_id: userId,
    n: randomBytes(16).toString("base64url"),
    exp: Math.floor(Date.now() / 1000) + NONCE_TTL_SECONDS,
  });
}

export function verifyGiftNonce(token: string | undefined | null, userId: string): boolean {
  const payload = verifySession<AppGiftNonce>(token);
  return payload?.kind === "app_gift" && payload.user_id === userId;
}

export type DeviceVerdict =
  | { ok: true; deviceKey: string }
  | { ok: false; reason: "not_configured" | "invalid" };

/**
 * Platform kanıtını doğrular ve cihazın KALICI anahtarını döner (yeniden
 * kurulumda değişmeyen). Kanıt nonce'u içermeli — tekrar oynatma koruması.
 */
export async function verifyDeviceProof(
  platform: DevicePlatform,
  proof: string,
  nonce: string
): Promise<DeviceVerdict> {
  // TODO(Aşama 3): iOS → App Attest assertion + DeviceCheck query/update_two_bits;
  // Android → Play Integrity decodeIntegrityToken (requestDetails.nonce eşleşmeli,
  // appIntegrity PLAY_RECOGNIZED, deviceIntegrity MEETS_DEVICE_INTEGRITY).
  void platform;
  void proof;
  void nonce;
  return { ok: false, reason: "not_configured" };
}

/** DB'ye ham kimlik değil, platformla tuzlanmış özeti girer. */
export function deviceHash(platform: DevicePlatform, deviceKey: string): string {
  return createHash("sha256").update(`pmj-app-gift:${platform}:${deviceKey}`).digest("hex");
}
