-- 0038: Yeni mekan adminleri için Google bağlama zorunluluğu.
--
-- 0030 ile Google hesabı bağlamak isteğe bağlıydı: panelin üstünde uyarı çıkıyor
-- ama admin görmezden gelebiliyordu. Şifresini unutan admin kurtarma adresi
-- olmadığı için super admin'e kalıyor. Bundan sonra açılan mekanlarda ilk
-- girişte bağlama ekranı çıkar ve bağlanana kadar panelin hiçbir yeri (player
-- dahil) açılmaz.
--
-- Bayrak satır bazlı çünkü ZATEN ÇALIŞAN mekanlar kilitlenmemeli: mevcut tüm
-- adminler false ile işaretlenir, yalnızca bu SQL'den sonra açılan hesaplar
-- varsayılan true ile gelir. Bir mekanı elle muaf tutmak gerekirse bu kolon
-- false yapılır.
--
-- Uygulama: Supabase Dashboard > SQL Editor'da 0037'den SONRA çalıştırın.
-- Sıralama: ÖNCE bu SQL, SONRA kod deploy'u (kolon yokken oturum sürümü
-- doğrulaması okunamaz duruma düşer).

begin;

alter table public.venue_admins
  add column if not exists google_link_required boolean not null default true;

-- Bu migration'ın çalıştığı andaki adminler eski kurala tabi: uyarı görürler,
-- engellenmezler. (Kolon yeni eklendiği için hepsi default true gelmiş olur.)
update public.venue_admins set google_link_required = false;

commit;

-- PostgREST şema önbelleğini tazele: yeni kolon hemen sorgulanabilsin
notify pgrst, 'reload schema';
