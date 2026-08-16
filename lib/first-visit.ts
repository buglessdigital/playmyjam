"use client";

// Mekana ilk kez giren ziyaretçiyi işaretler. Önceden burada 3 adımlık bir
// anlatım modalı vardı; yeni gelen önce yazı okumak zorunda kalıyordu. Artık
// işaret yalnızca "aramayı kendiliğinden aç" kararı için kullanılıyor: ilk iş
// şarkıyı bulmak, sonra jetonu almak.
//
// Neden localStorage: ziyaretçinin hesabı olmayabilir, işaret cihazda durmalı.
// Mekan bazlı, çünkü her mekanın kataloğu ayrı. Okunamıyorsa (gizli mod) ilk
// ziyaret sayılmaz — arama her açılışta zorla açılıp rahatsız etmesin.
//
// ESKİ ANAHTAR bilinçli korunuyor: eski modalı görmüş kullanıcı "yeni" sayılmaz.
const STORAGE_PREFIX = "pmj-vibe-intro:";

/** İlk ziyaret mi? Bir kez true döner, sonrasında hep false. */
export function takeFirstVisit(venueId: string): boolean {
  try {
    if (window.localStorage.getItem(STORAGE_PREFIX + venueId) === "1") return false;
    window.localStorage.setItem(STORAGE_PREFIX + venueId, "1");
    return true;
  } catch {
    return false;
  }
}
