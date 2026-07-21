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

export function createCheckoutForm(
  request: CheckoutFormInitializeRequest
): Promise<CheckoutFormInitializeResult> {
  return new Promise((resolve, reject) => {
    new CheckoutFormInitializeResource(getConfig()).create(request, (err, result) => {
      if (err) return reject(err);
      resolve(result as CheckoutFormInitializeResult);
    });
  });
}

// Callback'ten gelen `token` asla direkt güvenilmez: iyzico'nun retrieve API'si
// kendi secret key'imizle server-to-server çağrılıp gerçek ödeme durumu doğrulanır.
export function retrieveCheckoutForm(token: string): Promise<CheckoutFormRetrieveResult> {
  return new Promise((resolve, reject) => {
    new CheckoutFormResource(getConfig()).retrieve({ locale: "tr", token }, (err, result) => {
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
