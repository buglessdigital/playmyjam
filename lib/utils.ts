export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  // Web Crypto + rejection sampling: kriptografik olarak güvenli ve modulo bias'sız
  const limit = 256 - (256 % chars.length);
  const out: string[] = [];
  const buf = new Uint8Array(32);
  while (out.length < 10) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte < limit && out.length < 10) {
        out.push(chars.charAt(byte % chars.length));
      }
    }
  }
  return out.join("");
}
