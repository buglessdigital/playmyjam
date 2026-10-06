#!/usr/bin/env node
// maplibre-gl (Mekanlar haritası) çizimi ayrı bir Web Worker'da yapar ve
// worker dosyasını kendi modülünün YANINDA arar. Bundler modülü parçalara
// böldüğü için o yol kırılıyor ("Worker failed to load"). Worker ve onun
// içe aktardığı paylaşılan parça, derlemeden önce public/'e kopyalanır;
// istemci setWorkerUrl ile buraya yönlendirilir (bkz. app/venue/[venueId]/map/VenueMap.tsx).
// Sürüm paketle birlikte gelir — elle güncellenecek bir şey yok.

import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const from = join(root, "node_modules", "maplibre-gl", "dist");
const to = join(root, "public", "vendor", "maplibre");

mkdirSync(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(from, file), join(to, file));
}
