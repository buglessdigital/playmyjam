import type { StyleSpecification, LayerSpecification } from "maplibre-gl";

// Mekanlar haritasının görünümü: OpenFreeMap'in "dark" stili PlayMyJam
// tonlarına boyanır (koyu mor zemin, mor yollar, pembe vurgu iğnelerde).
//
// Neden OpenFreeMap: anahtarsız, kotasız, ticari kullanıma açık vektör karo
// (OpenStreetMap verisi). Google/Mapbox anahtar + faturalandırma ister.
// Stil her açılışta karo sunucusundan çekilir; burada yalnız renkler değişir,
// katman yapısı OpenFreeMap'te kalır.

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

type Palette = Record<
  | "bg" | "land" | "green" | "water" | "building" | "buildingEdge" | "path" | "minor" | "major"
  | "motorway" | "casing" | "rail" | "boundary" | "label" | "labelDim" | "halo",
  string
>;

const DARK: Palette = {
  bg: "#0f0a18",
  land: "#130c20",
  green: "#151026",
  water: "#1d1236",
  building: "#1a1129",
  buildingEdge: "#251a3a",
  path: "#221838",
  minor: "#2b1e46",
  major: "#3d2463",
  motorway: "#5a2a72",
  casing: "rgba(233,30,140,0.22)",
  rail: "#261b3c",
  boundary: "#3a2a55",
  label: "#9a8cb8",
  labelDim: "#6f6390",
  halo: "#0f0a18",
};

// Açık tema (müşteri paneli, bkz. lib/theme.ts): lila zemin, beyaz sokaklar,
// pembe ana yollar — aynı kulüp, gündüz
const LIGHT: Palette = {
  bg: "#f6f1fb",
  land: "#f1e9f8",
  green: "#e5efe1",
  water: "#d6d4f3",
  building: "#ece3f4",
  buildingEdge: "#dccfea",
  path: "#ffffff",
  minor: "#ffffff",
  major: "#f8d9ec",
  motorway: "#f2b4d8",
  casing: "rgba(233,30,140,0.28)",
  rail: "#d9cde8",
  boundary: "#c4b2da",
  label: "#4f416b",
  labelDim: "#857a9e",
  halo: "#f6f1fb",
};

// Katman adına göre boya. Sıra önemli: ilk eşleşen kazanır.
const rules = (C: Palette): [RegExp, Record<string, unknown>][] => [
  [/^background$/, { "background-color": C.bg }],
  [/^water$/, { "fill-color": C.water }],
  [/^waterway/, { "line-color": C.water }],
  [/^water_name/, { "text-color": C.labelDim, "text-halo-color": C.halo }],
  [/^landuse_residential/, { "fill-color": C.land }],
  [/^landcover_(wood|grass)|^landuse_park/, { "fill-color": C.green }],
  [/^landcover/, { "fill-color": C.bg }],
  [/^building/, { "fill-color": C.building, "fill-outline-color": C.buildingEdge }],
  [/^aeroway.*casing/, { "line-color": C.minor }],
  [/^aeroway-area/, { "fill-color": C.land }],
  [/^aeroway/, { "line-color": C.land }],
  [/^road_area_pier/, { "fill-color": C.bg }],
  [/^road_pier/, { "line-color": C.bg }],
  [/^highway_path/, { "line-color": C.path }],
  [/^highway_minor/, { "line-color": C.minor }],
  [/^highway_(major|motorway)_casing/, { "line-color": C.casing }],
  [/^highway_major/, { "line-color": C.major }],
  [/^highway_motorway/, { "line-color": C.motorway }],
  [/^railway.*dashline/, { "line-color": C.bg }],
  [/^railway/, { "line-color": C.rail }],
  [/^highway_name/, { "text-color": C.labelDim, "text-halo-color": C.halo }],
  [/^boundary/, { "line-color": C.boundary }],
  [/^place_/, { "text-color": C.label, "text-halo-color": C.halo }],
];

function paint(layer: LayerSpecification, RULES: [RegExp, Record<string, unknown>][]): LayerSpecification {
  if (layer.type === "raster") {
    // Düşük yakınlıktaki gölgeli kabartma: gri lekeler mor zemini bozmasın
    return { ...layer, paint: { ...layer.paint, "raster-opacity": 0.12, "raster-saturation": -1 } };
  }
  const rule = RULES.find(([re]) => re.test(layer.id));
  if (!rule || layer.type === "hillshade" || layer.type === "color-relief") return layer;
  const current = ("paint" in layer ? layer.paint : undefined) ?? {};
  // Yalnız katmanın zaten taşıdığı renk anahtarları değişir (tip uyuşmazlığı olmasın)
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(rule[1])) {
    const family = key.split("-")[0];
    if (family === layer.type || (layer.type === "symbol" && family === "text")) next[key] = value;
  }
  const out = { ...layer, paint: next } as LayerSpecification;
  // Yer adları yerel dilde: stil İngilizceyi öne alıyor ("Gulf of İzmir");
  // Türkiye'de OSM'nin "name" alanı zaten Türkçe
  if (out.type === "symbol" && /^(place_|water_name|highway_name_other)/.test(out.id)) {
    out.layout = { ...out.layout, "text-field": ["coalesce", ["get", "name"], ["get", "name:latin"]] };
  }
  return out;
}

export async function loadPmjMapStyle(
  signal?: AbortSignal,
  theme: "dark" | "light" = "dark"
): Promise<StyleSpecification | string> {
  try {
    const res = await fetch(MAP_STYLE_URL, { signal });
    if (!res.ok) return MAP_STYLE_URL;
    const style = (await res.json()) as StyleSpecification;
    const r = rules(theme === "light" ? LIGHT : DARK);
    return { ...style, layers: style.layers.map((layer) => paint(layer, r)) };
  } catch {
    // Boyanamazsa orijinal koyu stil — harita yine açılır
    return MAP_STYLE_URL;
  }
}
