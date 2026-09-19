// iyzipay resmi SDK'sının callback tabanlı API'sini Promise'e sarar. @types/iyzipay
// paketi checkoutFormInitialize.create için paymentCard/installments alanlarını
// zorunlu kılıyor (o alanlar iyzico'nun barındırdığı Checkout Form'da geçersiz —
// kart bilgisi hiç bize gelmiyor), bu yüzden burada elle, sadece kullandığımız
// alanları içeren tipler tanımlanıyor.
//
// Not: iyzipay'in ana `Iyzipay` sınıfı, kullanılmayan ~50 kaynak dosyasını
// `fs.readdirSync` + dinamik `require()` ile yükler. Turbopack bunu statik
// olarak bundle edemez, ve serverExternalPackages ile "dokunma" dendiğinde bu
// sefer Vercel'in file-tracing'i iyzipay'in kendi bağımlılığı `postman-request`'i
// dahil etmeyi atlıyor (üretimde "Cannot find module 'postman-request'" ile
// patladı). Çözüm: sadece ihtiyacımız olan iki kaynağı, sabit (dinamik olmayan)
// yol ile require ediyoruz — bunlar normal bundling'e girer, postman-request de
// zincirleme olarak otomatik dahil olur.
import CheckoutFormInitializeResource from "iyzipay/lib/resources/CheckoutFormInitialize";
import CheckoutFormResource from "iyzipay/lib/resources/CheckoutForm";
import { createHmac, timingSafeEqual } from "node:crypto";

interface IyzicoAddress {
  contactName: string;
  city: string;
  country: string;
  address: string;
  zipCode?: string;
}

interface IyzicoBuyer {
  id: string;
  name: string;
  surname: string;
  email: string;
  identityNumber: string;
  registrationAddress: string;
  ip: string;
  city: string;
  country: string;
}

interface IyzicoBasketItem {
  id: string;
  name: string;
  category1: string;
  itemType: "VIRTUAL";
  price: string;
}

export interface CheckoutFormInitializeRequest {
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: "TRY";
  basketId: string;
  paymentGroup: "PRODUCT";
  callbackUrl: string;
  buyer: IyzicoBuyer;
  shippingAddress: IyzicoAddress;
  billingAddress: IyzicoAddress;
  basketItems: IyzicoBasketItem[];
  // Kart saklama (0048): gönderilirse ödeme formu bu kullanıcının iyzico'da
  // saklı kartlarını listeler. Anahtar iyzico tarafında silinmişse initialize
  // başarısız döner — çağıran taraf anahtarsız tekrar denemekle yükümlü.
  cardUserKey?: string;
}

export interface CheckoutFormInitializeResult {
  status: string;
  errorMessage?: string;
  token: string;
  paymentPageUrl: string;
  checkoutFormContent: string;
}

export interface CheckoutFormRetrieveResult {
  status: string;
  errorMessage?: string;
  paymentStatus: string;
  paymentId: string;
  currency: string;
  basketId: string;
  conversationId: string;
  paidPrice: number | string;
  price: number | string;
  token: string;
  signature?: string;
  // Kullanıcı ödeme formunda kartını saklattıysa iyzico bu iki alanı döndürür.
  // cardUserKey kalıcı olarak profilde tutulur (0048); cardToken tek bir karta
  // işaret ettiği için saklanmıyor — formu cardUserKey ile açmak yeterli.
  cardUserKey?: string;
  cardToken?: string;
}

// IyzicoResourceConfig: types/iyzipay.d.ts içinde global ambient tip olarak tanımlı
function getConfig(): IyzicoResourceConfig {
  const apiKey = process.env.IYZICO_API_KEY;
  const secretKey = process.env.IYZICO_SECRET_KEY;
  const uri = process.env.IYZICO_BASE_URL;
  if (!apiKey || !secretKey || !uri) {
    throw new Error("iyzico env eksik: IYZICO_API_KEY / IYZICO_SECRET_KEY / IYZICO_BASE_URL");
  }
  return { apiKey, secretKey, uri };
}

// SDK'nın HTTP katmanı (postman-request) Eylül 2026 itibarıyla iyzico'ya her
// istekte ECONNRESET alıyor; aynı istek Node'un fetch'iyle sorunsuz geçiyor.
// Gövde modeli ve IYZWSv2 imzası SDK'da kalır, yalnızca gönderim fetch'e alınır.
// İmza JSON.stringify(body) üzerinden atıldığı için birebir aynı string gönderilir.
type SdkRequestInternals = {
  _preparePath(method: string): void;
  _getMethod(method: string): string;
  _getUrl(method: string): string;
  _getHttpHeaders(method: string): Record<string, string>;
  _getQueryString(method: string): Record<string, string>;
  _getBody(method: string): unknown;
  _request(method: string, cb: (err: Error | null, res: unknown, body: unknown) => void): void;
};

function withFetchTransport<T extends object>(resource: T): T {
  const r = resource as unknown as SdkRequestInternals;
  r._request = function (method, cb) {
    this._preparePath(method);
    const url = new URL(this._getUrl(method));
    for (const [k, v] of Object.entries(this._getQueryString(method))) url.searchParams.set(k, String(v));
    const httpMethod = this._getMethod(method);
    const body = this._getBody(method);
    fetch(url, {
      method: httpMethod,
      headers: { ...this._getHttpHeaders(method), "Content-Type": "application/json", Accept: "application/json" },
      body: httpMethod === "GET" ? undefined : JSON.stringify(body),
    })
      .then(async (res) => cb(null, res, await res.json()))
      .catch((err: Error) => cb(err, null, null));
  };
  return resource;
}

export function createCheckoutForm(
  request: CheckoutFormInitializeRequest
): Promise<CheckoutFormInitializeResult> {
  return new Promise((resolve, reject) => {
    withFetchTransport(new CheckoutFormInitializeResource(getConfig())).create(request, (err, result) => {
      if (err) return reject(err);
      resolve(result as CheckoutFormInitializeResult);
    });
  });
}

// Callback'ten gelen `token` asla direkt güvenilmez: iyzico'nun retrieve API'si
// kendi secret key'imizle server-to-server çağrılıp gerçek ödeme durumu doğrulanır.
export function retrieveCheckoutForm(token: string): Promise<CheckoutFormRetrieveResult> {
  return new Promise((resolve, reject) => {
    withFetchTransport(new CheckoutFormResource(getConfig())).retrieve({ locale: "tr", token }, (err, result) => {
      if (err) return reject(err);
      resolve(result as CheckoutFormRetrieveResult);
    });
  });
}

// iyzico dokümantasyonundaki imza doğrulama: HMAC-SHA256(secretKey, alanlar ':' ile
// birleştirilmiş). Retrieve sonucunun gerçekten iyzico'dan geldiğini teyit eder
// (defense-in-depth — retrieve zaten kendi secret key'imizle server-to-server yapılıyor).
export function verifyCheckoutFormSignature(result: CheckoutFormRetrieveResult): boolean {
  const secretKey = process.env.IYZICO_SECRET_KEY;
  if (!secretKey || !result.signature) return false;
  const dataToCheck = [
    result.paymentStatus,
    result.paymentId,
    result.currency,
    result.basketId,
    result.conversationId,
    String(result.paidPrice),
    String(result.price),
    result.token,
  ].join(":");
  const expected = createHmac("sha256", secretKey).update(dataToCheck).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(result.signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
