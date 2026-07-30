import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// KVKK md. 7 / md. 11-e: kullanıcı hesabının ve kişisel verilerinin silinmesini
// isteyebilir. Silme işlemi geri alınamaz.
//
// Bağımlı satırlar cascade'e bırakılmadan sırayla siliniyor: şemadaki bazı
// yabancı anahtarlar cascade tanımlı değil, o durumda auth kullanıcısının
// silinmesi FK ihlaliyle patlardı.
//
// payment_orders BİLEREK silinmiyor — ticari kayıt saklama yükümlülüğü var.
// 0020 migration'ı ile kayıt kullanıcıdan koparılır (user_id null'a düşer).
const CONFIRM_PHRASE = "HESABIMI SİL";

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "Giriş yapmalısın" }, { status: 401 });
  }

  // Yanlışlıkla/otomatik tetiklenmeye karşı ikinci kapı
  const body = await req.json().catch(() => null);
  if (body?.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: "Onay metni eşleşmiyor" }, { status: 400 });
  }

  // Sıra önemli: önce yaprak tablolar, en sonda auth kullanıcısı
  const tables = [
    "queue",
    "song_requests",
    "user_favorites",
    "push_subscriptions",
    "wallet_transactions",
    "user_wallets",
    "profiles",
  ] as const;

  for (const table of tables) {
    const column = table === "profiles" ? "id" : "user_id";
    const { error } = await supabaseAdmin.from(table).delete().eq(column, userId);
    if (error) {
      console.error(`[account-delete] ${table} silinemedi:`, error.message);
      return NextResponse.json({ error: "Hesap silinemedi. Lütfen tekrar deneyin." }, { status: 500 });
    }
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[account-delete] auth kullanıcısı silinemedi:", deleteError.message);
    return NextResponse.json({ error: "Hesap silinemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
