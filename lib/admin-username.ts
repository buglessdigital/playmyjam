// Mekan admini kullanıcı adını elle yazıyor; "The-Mezzanine-Bar" ile
// "the-mezzanine-bar" aynı hesap olmalı. Sorgular `eq()` ile birebir aradığı
// sürece harf farkı hesabı "yok" gösteriyordu: girişte "şifre hatalı",
// şifre sıfırlamada ise — yanıt bilgi sızdırmamak için her durumda aynı
// olduğundan — hiçbir uyarı vermeden mailin hiç çıkmaması demekti.
//
// Bu yüzden arama `ilike` ile yapılıyor. Desen kaçırma zorunlu: kullanıcı adı
// serbest metin olarak geliyor ve `%`, `_` PostgreSQL LIKE'ında joker.

const LIKE_SPECIALS = /[\\%_]/g;
// `*` PostgREST tarafından `%`e çevriliyor; `,()"` ise or() filtresinin kendi
// dilbilgisini bozuyor. Hiçbiri geçerli bir kullanıcı adında ya da e-postada
// bulunamayacağı için bu karakterleri içeren giriş doğrudan eşleşmez sayılır.
const UNSAFE = /[*,()"]/;

/** Serbest metni birebir eşleşecek bir ilike desenine çevirir. */
export function likePattern(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || UNSAFE.test(trimmed)) return null;
  return trimmed.replace(LIKE_SPECIALS, (ch) => `\\${ch}`);
}

/**
 * Harf farkıyla birden fazla satır dönerse birebir yazılanı tercih eder;
 * yoksa ilk satırı verir.
 */
export function pickExact<T extends { username: string }>(
  rows: T[] | null | undefined,
  username: string
): T | null {
  if (!rows?.length) return null;
  return rows.find((row) => row.username === username.trim()) ?? rows[0];
}
