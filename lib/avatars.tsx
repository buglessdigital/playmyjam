import Image from "next/image";

// Müşteri profil avatarları. Görseller public/avatars/ altında durur; burada
// yalnızca hangi id'nin hangi dosyaya karşılık geldiği tanımlıdır.
// profiles.avatar_id kolonuna bu id'ler yazılır.
//
// Dosya adı kuralı: public/avatars/<id>.<AVATAR_EXT>  (ör. avatar-01.webp)
// Tüm avatarlar aynı uzantıda olmalı — farklı formata geçilecekse
// AVATAR_EXT tek noktadan değiştirilir.
//
// Yayındaki dosyalar 512px webp. Kaynak 2048px PNG'ler design/avatar-originals/
// altında (git'e girmiyor); yeni avatar üretilirse aynı işlemden geçmeli:
// %85 merkez kırpma + üstten %6 kaydırma (yuvarlak kırpmada yüz küçük kalmasın),
// 512x512'e küçültme, webp q82. Şeffaflık yok, zemin #1a0e2a'ya düzleştirilir.
//
// LİSTEDEN ID SİLME, sadece ekle: silinen bir id'yi seçmiş kullanıcılarda
// avatar sessizce baş harfe düşer.

const AVATAR_EXT = "webp";
const AVATAR_COUNT = 12;

export type Avatar = {
  id: string;
  label: string;
  src: string;
};

export const AVATARS: Avatar[] = Array.from({ length: AVATAR_COUNT }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `avatar-${n}`,
    label: `Avatar ${i + 1}`,
    src: `/avatars/avatar-${n}.${AVATAR_EXT}`,
  };
});

const AVATAR_MAP = new Map(AVATARS.map((a) => [a.id, a]));

export function getAvatar(id: string | null | undefined): Avatar | null {
  if (!id) return null;
  return AVATAR_MAP.get(id) ?? null;
}

// Bilinmeyen id (eski/kaldırılmış avatar, elle yazılmış değer) sessizce baş
// harfe düşsün diye yazmadan önce burada doğrulanır.
export function isAvatarId(id: string): boolean {
  return AVATAR_MAP.has(id);
}

interface AvatarMarkProps {
  avatarId: string | null;
  /** Avatar seçilmemişse gösterilecek baş harf */
  initial: string;
  size: number;
}

/** Yuvarlak avatar görseli. Avatar yoksa aynı çerçevede baş harf gösterir. */
export function AvatarMark({ avatarId, initial, size }: AvatarMarkProps) {
  const avatar = getAvatar(avatarId);

  if (!avatar) {
    return (
      <div
        className="flex items-center justify-center rounded-full text-white"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #e91e8c, #8b5cf6)",
        }}
      >
        <span className="font-black" style={{ fontSize: Math.round(size * 0.42) }}>
          {initial}
        </span>
      </div>
    );
  }

  return (
    <Image
      src={avatar.src}
      alt=""
      width={size}
      height={size}
      // Görseller kare değilse kırpılsın; arkada koyu zemin kalırsa boşluk göze
      // batmasın diye panel yüzey rengiyle aynı
      className="rounded-full object-cover"
      style={{ width: size, height: size, background: "#241634" }}
    />
  );
}
