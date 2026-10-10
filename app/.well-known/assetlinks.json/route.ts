// Android App Links doğrulaması: AndroidManifest'teki autoVerify filtresi
// (https://playmyjam.com.tr/venue/…) ancak bu dosya imza parmak iziyle
// yayındaysa uygulamayı doğrudan açar, yoksa "hangi uygulamayla?" sorar.
//
// ANDROID_CERT_SHA256: Play Console → Uygulama imzalama → SHA-256 (birden çok
// ise virgülle; yerel debug imzası da eklenebilir). Boşsa 404.
// Bkz. docs/notlar/pmj-mobil-uygulama-2026-10.md

const PACKAGE_NAME = "com.playmyjam.app";

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  if (fingerprints.length === 0) return new Response("Not found", { status: 404 });

  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { "cache-control": "public, max-age=3600" } }
  );
}
