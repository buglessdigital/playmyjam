// Sunucu bileşeninden (kök layout) okunabilsin diye "use client" dosyasından
// ayrı: lib/theme.ts ile aynı anahtar ve kuralı kullanır.

export const THEME_KEY = "pmj-theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Kök layout <head>'inde, ayrıştırma sırasında çalışır (React'ten önce) */
export const THEME_BOOT_SCRIPT = `(function(){try{
if(!/^\\/venue\\//.test(location.pathname))return;
var p=localStorage.getItem("${THEME_KEY}");
var t=p==="light"||(p==="system"&&!matchMedia("${DARK_QUERY}").matches)?"light":"dark";
document.documentElement.setAttribute("data-theme",t);
}catch(e){}})();`;
