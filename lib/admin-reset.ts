import { createHash } from "node:crypto";

// Sıfırlama bağlantısının ömrü: mailin gelmesi için rahat, çalınan bir bağlantı
// için dar. Mail metninde de bu değer yazıyor (lib/mail.ts).
export const RESET_TOKEN_TTL_MINUTES = 60;

// Veritabanında ham token yerine özeti durur: satırları okuyabilen biri
// geçerli bir bağlantı üretemesin
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
