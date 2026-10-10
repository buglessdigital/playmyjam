// Uygulama ikonu + açılış ekranı kaynaklarını logo-mark.svg'den üretir;
// ardından `npm run assets` platform boyutlarına böler.
//   node assets/build-sources.mjs && npm run assets
import sharp from "sharp";
import { readFileSync } from "node:fs";

const BG = "#0f0a18";
const svg = readFileSync(new URL("./logo-mark.svg", import.meta.url));
const out = (name) => new URL(`./${name}`, import.meta.url).pathname;

// Logo, kare tuvalin `ratio` kadar yüksekliğinde ortalanır
async function compose(size, ratio, background, file) {
  const h = Math.round(size * ratio);
  const logo = await sharp(svg, { density: 1200 }).resize({ height: h }).png().toBuffer();
  const meta = await sharp(logo).metadata();
  await sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png()
    .toFile(out(file));
}

// iOS: tam dolu kare, şeffaflık YOK (Apple reddeder); oran PWA maskable ikonuyla aynı
await compose(1024, 0.5, BG, "icon-only.png");
// Android uyarlanabilir ikon: ön plan şeffaf, güvenli alan (%66) içinde kalsın
await compose(1024, 0.42, null, "icon-foreground.png");
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile(out("icon-background.png"));
// Açılış ekranı: koyu zemin, ortada küçük logo
await compose(2732, 0.16, BG, "splash.png");
await compose(2732, 0.16, BG, "splash-dark.png");
console.log("kaynaklar hazır");
