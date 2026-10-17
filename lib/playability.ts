// Bir videonun KALICI olarak çalınamaz sayılıp sayılmayacağı kararı. Saf
// fonksiyon (importsuz) — testi lib/playability.test.ts.
//
// Neden ayrı bir karar: player'ın onError'u (100/101/150) tek başına kanıt
// DEĞİL. 17 Eki 2026 Mezzanine'de önyükleme deck'i dakikalar önce sonuna kadar
// çalmış 15 şarkıya "150 = gömmeye kapalı" dedi; eski kod bu tek sinyalle
// şarkıyı bütün mekanların listelerinden siliyordu. Artık damga yalnızca
// YouTube Data API videonun gerçekten çalınamadığını söylerse vurulur.

export type PlayabilityVerdict = "playable" | "unplayable" | "unknown";

export type PlayabilityItem = {
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
  contentDetails?: { regionRestriction?: { allowed?: string[]; blocked?: string[] } };
};

/**
 * item: videos.list yanıtındaki satır. Yanıt başarılı geldi ama video içinde
 * yoksa null (silinmiş ya da gizlenmiş). API'ye hiç ulaşılamadıysa bu fonksiyon
 * çağrılmaz — çağıran "unknown" döner ve damga VURULMAZ.
 */
export function playabilityVerdict(item: PlayabilityItem | null, region = "TR"): PlayabilityVerdict {
  if (!item) return "unplayable";
  if (item.status?.embeddable === false) return "unplayable";
  if (item.status?.privacyStatus === "private") return "unplayable";
  const upload = item.status?.uploadStatus;
  if (upload && upload !== "processed" && upload !== "uploaded") return "unplayable";
  const rr = item.contentDetails?.regionRestriction;
  if (rr?.blocked?.includes(region)) return "unplayable";
  if (rr?.allowed && !rr.allowed.includes(region)) return "unplayable";
  return "playable";
}
