// Tosla İşim / sanal POS başvurusu için sitede görünmesi zorunlu satıcı bilgileri.
// TODO(taner): Telefon ve adres alanlarını gerçek bilgilerinle doldur —
// Tosla ekibi siteyi incelerken bu bilgilerin eksiksiz olmasını şart koşuyor.
export const COMPANY = {
  brand: "PlayMyJam",
  legalName: "Taner Yıldırım",
  email: "taneryldrm111@gmail.com",
  phone: "+90 544 312 77 98", // TODO(taner): gerçek telefon numarası
  address: "Rafetpaşa Mahallesi Yıldırım Beyazıt Caddesi no:216A daire:1 Bornova/İzmir", // TODO(taner): açık adres (mahalle, cadde, no, ilçe/il)
  city: "Türkiye",
} as const;
