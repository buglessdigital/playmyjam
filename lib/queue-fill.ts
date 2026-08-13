import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

// Kuyruk artık "10 şarkılık kayan pencere" DEĞİL: sıradaki listeler bitip başa
// sarana kadarki şarkıların hepsi kuyruğa yazılır, panel ve player ne
// gösteriyorsa aynen o çalar. QUEUE_FLOOR yalnızca listelerden şarkı çıkmadığı
// hallerde (kuyrukta liste yok, ya da kalanlar şu an çalınamıyor) katalogdan
// doldurulan tabandır — müzik susmasın diye.
const QUEUE_FLOOR = 10;
// Emniyet tavanı: 3000 şarkılık listeler paneli ve DB'yi boğmasın. Tavanın
// dışında kalan şarkılar kuyruk eridikçe eklenir.
export const QUEUE_CAP = 500;
export const AUTO_POSITION_BASE = 9000;
const COOLDOWN_MS = 30 * 60 * 1000;
// PostgREST `in(...)` filtresi URL'e gömülür; 500 uuid tek istekte sığmaz.
const IN_CHUNK = 100;

function chunk<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Kuyruktaki üç sınıf added_by ile ayrılır: müşteri satırlarında kullanıcı adı,
// otomatik dolumda "auto", adminin panelden elle eklediğinde "admin". İkincisi
// budanabilir, üçüncüsü budanamaz — admin bilerek koymuştur.
export const ADMIN_ADDED_BY = "admin";
export const AUTO_ADDED_BY = "auto";

// Rotasyonun tuttuğu iki şey: hangi listedeyiz ve bu turda o listenin hangi
// şarkıları tüketildi (0032). "Tüketildi" = kuyruğa yazıldı; kuyruk artık liste
// sonuna kadar uzadığı için bir liste tek dolumda baştan sona tüketilebilir.
type RotationPick = { songId: string; playlistId: string };
type ConsumedRow = { playlist_id: string; song_id: string; cycle: number };

type EligibilityContext = {
  // Katalogda duran, müşteriye açık ve embed'e izin veren şarkılar
  catalogEligible: Set<string>;
  // Şu anda kuyrukta bekleyen / sahnede olan şarkılar — tekrar eklenemez
  excludeIds: Set<string>;
  // Son 30 dk içinde müşteri isteğiyle çalmış şarkılar (0025)
  cooldownIds: Set<string>;
  // Kuyrukta BEKLEYEN otomatik satırların listeleri. Şarkıları tükenmiş olsa da
  // kuyrukta satırı duran liste "bitti" sayılmaz.
  pendingLists: Set<string>;
  // Sahnedeki şarkının listesi — çalarken kuyruktan düşürülmez
  playingList: string | null;
  // Kuyrukta şu an kaç şarkı var (30 dk kilidinin yalnızca yakın sıraya
  // uygulanması için)
  queuedNow: number;
};

function shuffleInPlace<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Aktif playlist seçimi değişince çağrılır: kuyrukta bekleyen OTOMATİK şarkılar
// (added_by='auto') düşer ve yeni havuzdan yeniden doldurulur. Müşterinin jeton
// harcayarak eklediği şarkılara, adminin elle eklediklerine ve sahnede çalana
// dokunulmaz.
export async function resetAutoQueue(venueId: string): Promise<void> {
  await clearAutoQueue(venueId);
  await fillQueue(venueId);
}

// resetAutoQueue'nun ilk yarısı: bekleyen otomatik satırları düşürür ama YENİDEN
// DOLDURMAZ. Araya rotasyon imlecini taşıyan bir adım girecekse (bkz.
// jumpPlaylistCursorTo) dolum ancak imleç yerine oturduktan sonra yapılmalı;
// yoksa kuyruk eski imleçle dolar ve ikinci dolum boş geçer.
export async function clearAutoQueue(venueId: string): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from("queue")
    .select("song_id, source_playlist_id")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .eq("added_by", AUTO_ADDED_BY);

  await supabaseAdmin
    .from("queue")
    .update({ status: "removed" })
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .eq("added_by", AUTO_ADDED_BY);

  await unconsumeRows(venueId, pending ?? []);
}

// Kuyruktan hiç çalmadan düşen otomatik satırların "tüketildi" işaretini geri
// alır — yoksa o şarkılar listenin bu turunu ıskalar ve liste erken biter.
// Kuyruk liste sonuna kadar uzayabildiği için silmeler parçalara bölünür:
// PostgREST `in(...)` filtresi URL'e gömülüyor.
async function unconsumeRows(
  venueId: string,
  rows: { song_id: string; source_playlist_id: string | null }[]
): Promise<void> {
  const sourced = rows.filter((r) => r.source_playlist_id);
  if (sourced.length === 0) return;

  const { data: state } = await supabaseAdmin
    .from("playlist_rotation")
    .select("cycle")
    .eq("venue_id", venueId)
    .maybeSingle();
  const cycle = state?.cycle ?? 1;

  const byList = new Map<string, string[]>();
  for (const row of sourced) {
    const list = byList.get(row.source_playlist_id!) ?? [];
    list.push(row.song_id);
    byList.set(row.source_playlist_id!, list);
  }

  await Promise.all(
    [...byList].flatMap(([playlistId, songIds]) =>
      chunk(songIds).map((ids) =>
        supabaseAdmin
          .from("playlist_rotation_consumed")
          .delete()
          .eq("venue_id", venueId)
          .eq("cycle", cycle)
          .eq("playlist_id", playlistId)
          .in("song_id", ids)
      )
    )
  );
}

// Playlist kuyruğundan seçici (0037). Kuyruk = queue_position dolu listeler.
// İmleçteki listeden başlayıp sırayla ilerler ve her listeden alınabilecek HER
// ŞEYİ alır: kuyruk, sıradaki listeler bitip başa saracağı noktaya kadar uzar
// (tavan: capacity). Panelde ve player'da görünen sıra bu yüzden gerçektir.
//
// Kuyruk TÜKETİLİR: çalıp biten liste kuyruktan düşer, kendiliğinden tekrar
// sıraya girmez — mekan isterse elle geri alır. "Bitti" demek için iki koşul
// birden gerekir: listede çalınmamış şarkı kalmayacak VE kuyrukta bekleyen
// satırı olmayacak. Sahnede çalan listenin satırı bitene kadar düşmez.
//
// Tek istisna: kuyrukta kalan SON liste düşmez, ilerlemesi sıfırlanıp baştan
// çalar. Yoksa tek listeli mekan sessizce katalog yedeğine kayardı.
//
// Dönüş null ise "kuyrukta liste yok" demektir; eksik dizi ise listelerden şu an
// alınabilecek şarkı bu kadardır. Her iki durumda da çağıran taraf kuyruğu
// QUEUE_FLOOR'a kadar katalogdan tamamlar, yani müzik susmaz.
async function pickFromRotation(
  venueId: string,
  capacity: number,
  ctx: EligibilityContext
): Promise<RotationPick[] | null> {
  // Listeler ve imleç birbirine bağlı değil — birlikte okunur
  const [{ data: allLists }, { data: state }] = await Promise.all([
    supabaseAdmin
      .from("playlists")
      // play_once artık okunmaz: kural her liste için aynı — turunu bitiren düşer.
      .select("id, queue_position, shuffle, created_at")
      .eq("venue_id", venueId)
      .order("queue_position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("playlist_rotation")
      .select("playlist_id, cycle")
      .eq("venue_id", venueId)
      .maybeSingle(),
  ]);

  const active = (allLists ?? []).filter((p) => p.queue_position !== null);
  if (active.length === 0) return null;

  // Tur numarası artık ARTMIYOR: kuyruk sonuna kadar yazıldığı için "başa sarma"
  // tek listenin ilerlemesini silerek yapılır (aşağıdaki rewind). cycle yalnızca
  // 0032'den kalan ilerleme anahtarı olarak duruyor.
  const cycle = state?.cycle ?? 1;

  const activeIds = active.map((p) => p.id);

  // Sayfalı: aktif listelerin toplam şarkısı 1000'i aşan mekanlarda tek sayfa
  // havuzu kırpar ve listelerin sonundaki şarkılar hiç çalmazdı.
  const [{ data: members }, { data: consumedRows }] = await Promise.all([
    fetchAllRows<{ playlist_id: string; song_id: string }>((from, to) =>
      supabaseAdmin
        .from("playlist_songs")
        .select("playlist_id, song_id, position, added_at")
        .eq("venue_id", venueId)
        .in("playlist_id", activeIds)
        .order("position", { ascending: true })
        .order("added_at", { ascending: true })
        .order("song_id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<{ playlist_id: string; song_id: string }>((from, to) =>
      supabaseAdmin
        .from("playlist_rotation_consumed")
        .select("playlist_id, song_id")
        .eq("venue_id", venueId)
        .eq("cycle", cycle)
        .in("playlist_id", activeIds)
        .order("song_id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const songsByList = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = songsByList.get(m.playlist_id) ?? [];
    list.push(m.song_id);
    songsByList.set(m.playlist_id, list);
  }

  const consumedByList = new Map<string, Set<string>>();
  for (const c of consumedRows ?? []) {
    const set = consumedByList.get(c.playlist_id) ?? new Set<string>();
    set.add(c.song_id);
    consumedByList.set(c.playlist_id, set);
  }

  // --- 1) Bitmiş listeleri ayıkla -------------------------------------------
  // Bir liste "bitti" sayılır: bu turda çalınmamış şarkısı kalmamış VE kuyrukta
  // bekleyen satırı da kalmamıştır. Sahnedeki şarkı sayılmaz — o hâlâ çalıyor.
  const unconsumed = (playlistId: string) => {
    const seen = consumedByList.get(playlistId);
    return (songsByList.get(playlistId) ?? []).filter((id) => !seen?.has(id));
  };
  const isDone = (playlistId: string) =>
    unconsumed(playlistId).length === 0 && !ctx.pendingLists.has(playlistId);

  const done = active.filter((p) => isDone(p.id));
  const dropped = new Set<string>();
  // Başa saran (ilerlemesi sıfırlanan) liste — kuyrukta kalan son liste
  let rewound: string | null = null;

  if (done.length === active.length) {
    // Kuyruktaki her şey tüketildi: son liste düşmez, baştan çalar. Sahnedeki
    // şarkının listesi varsa o kalır (en son çalan odur), yoksa imleçteki.
    const survivorId =
      (ctx.playingList && activeIds.includes(ctx.playingList) ? ctx.playingList : null) ??
      (state?.playlist_id && activeIds.includes(state.playlist_id) ? state.playlist_id : null) ??
      active[active.length - 1].id;

    rewound = survivorId;
    consumedByList.set(survivorId, new Set<string>());
    for (const p of active) {
      if (p.id !== survivorId && p.id !== ctx.playingList) dropped.add(p.id);
    }
  } else {
    // Sırası gelmiş, çalmış ve kuyruktan da tükenmiş listeler düşer; sahnede
    // çalan liste son şarkısı bitene kadar kuyrukta kalır.
    for (const p of done) {
      if (p.id !== ctx.playingList) dropped.add(p.id);
    }
  }

  const live = active.filter((p) => !dropped.has(p.id));

  // --- 2) İmleçten başlayarak listeleri sırayla tüket -------------------------
  // Her listeden alınabilecek HER ŞEY alınır; kuyruk ancak tavana dayanınca ya da
  // listeler bitince durur. Başa sarma yok: "bitip başa saracağı nokta" kuyruğun
  // sonudur.
  let startIdx = 0;
  if (state?.playlist_id) {
    const found = live.findIndex((p) => p.id === state.playlist_id);
    // İmleçteki liste kuyruktan çıkmış/silinmişse kuyruğun başından devam edilir.
    startIdx = found >= 0 ? found : 0;
  }

  const picks: RotationPick[] = [];
  const consumed: ConsumedRow[] = [];
  const taken = new Set<string>();

  for (let i = 0; i < live.length && picks.length < capacity; i++) {
    const playlist = live[(startIdx + i) % live.length];
    const memberIds = songsByList.get(playlist.id) ?? [];
    const alreadyConsumed = consumedByList.get(playlist.id) ?? new Set<string>();
    consumedByList.set(playlist.id, alreadyConsumed);

    const remaining = memberIds.filter((id) => !alreadyConsumed.has(id));

    // Kalıcı olarak çalınamaz olanlar (katalogdan düşmüş, gizlenmiş ya da embed'e
    // kapalı) listeyi kilitlemesin diye tüketilmiş sayılır.
    for (const id of remaining) {
      if (!ctx.catalogEligible.has(id)) {
        alreadyConsumed.add(id);
        consumed.push({ playlist_id: playlist.id, song_id: id, cycle });
      }
    }

    // Kuyrukta bekleyen / sahnedeki şarkı şimdilik eklenemez ama TÜKETİLMEZ:
    // müşteri istediği için orada olabilir, listenin ilerlemesini bozmaz.
    let candidates = remaining.filter(
      (id) => ctx.catalogEligible.has(id) && !ctx.excludeIds.has(id) && !taken.has(id)
    );
    if (playlist.shuffle) candidates = shuffleInPlace(candidates);

    for (const id of candidates) {
      if (picks.length >= capacity) break;
      // 30 dk kilidi yalnızca YAKIN sıraya uygulanır: kuyruk artık saatler
      // ilerisini tuttuğu için sondaki şarkı zaten kilit süresinden sonra çalar.
      // Yakında çalacaksa atlanır ve TÜKETİLMEZ — kilit açılınca sıraya girer.
      const soon = ctx.queuedNow + picks.length < QUEUE_FLOOR;
      if (soon && ctx.cooldownIds.has(id)) continue;
      picks.push({ songId: id, playlistId: playlist.id });
      taken.add(id);
      alreadyConsumed.add(id);
      consumed.push({ playlist_id: playlist.id, song_id: id, cycle });
    }
  }

  // --- 3) Yazmalar ------------------------------------------------------------
  // Başa saran listenin ilerlemesi önce silinir, yeni tüketimler sonra yazılır —
  // ters sırada olsaydı listenin yeni turu anında silinirdi.
  if (rewound) {
    await supabaseAdmin
      .from("playlist_rotation_consumed")
      .delete()
      .eq("venue_id", venueId)
      .eq("playlist_id", rewound);
  }

  if (dropped.size > 0) {
    await Promise.all([
      supabaseAdmin
        .from("playlists")
        .update({ queue_position: null })
        .eq("venue_id", venueId)
        .in("id", [...dropped]),
      // İlerlemesi de silinir: liste sonradan tekrar sıraya alınırsa "zaten
      // bitmiş" sayılıp anında düşmesin, baştan çalsın.
      supabaseAdmin
        .from("playlist_rotation_consumed")
        .delete()
        .eq("venue_id", venueId)
        .in("playlist_id", [...dropped]),
    ]);
  }

  if (consumed.length > 0) {
    await Promise.all(
      chunk(consumed, 500).map((rows) =>
        supabaseAdmin.from("playlist_rotation_consumed").upsert(
          rows.map((c) => ({
            venue_id: venueId,
            playlist_id: c.playlist_id,
            song_id: c.song_id,
            cycle: c.cycle,
          })),
          { onConflict: "venue_id,playlist_id,cycle,song_id", ignoreDuplicates: true }
        )
      )
    );
  }

  // İmleç = "şu an tüketilen liste": kuyrukta kalanlar arasında hâlâ çalınmamış
  // şarkısı olan ilki. Hepsi tüketildiyse sahnedeki/son liste. Kuyruk boşaldıysa
  // null — bir sonraki dolum katalog yedeğine düşer.
  let cursor: string | null = null;
  for (let i = 0; i < live.length; i++) {
    const candidate = live[(startIdx + i) % live.length];
    if (unconsumed(candidate.id).length > 0 || ctx.pendingLists.has(candidate.id)) {
      cursor = candidate.id;
      break;
    }
  }
  if (!cursor) {
    cursor = rewound ?? (live.length > 0 ? live[startIdx % live.length].id : null);
  }

  await supabaseAdmin.from("playlist_rotation").upsert(
    {
      venue_id: venueId,
      playlist_id: cursor,
      cycle,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id" }
  );

  return picks;
}

export async function fillQueue(venueId: string): Promise<void> {
  // Dolumun okumaları birbirine bağlı değil — hepsi tek turda gider. Ardışık
  // yapıldığında beş tur ediyordu ve "play'e bastım, sıra geç güncellendi"
  // şikayetinin büyük kısmı buradan geliyordu.
  //
  // 30 dk kuralı "eklenemez" değil "çalmaz": müşteri isteğiyle son 30 dk içinde
  // çalmaya başlamış şarkılar otomatik doldurmaya da girmez. auto-fill'in kendi
  // çaldıkları bu kurala girmez (user_id null) — onlar hemen tekrar seçilebilir.
  // played_at hep started_at'ten sonra olduğu için played_at filtresi üst küme;
  // asıl çapa (başlangıç anı) aşağıda süzülür.
  const cutoff = Date.now() - COOLDOWN_MS;
  const [{ data: queuedRows }, { data: playingNow }, { data: recentUserPlays }, { data: venueSongs }] =
    await Promise.all([
      // Sayım da bu satırlardan çıkar: ayrı bir count sorgusu atılmaz
      supabaseAdmin
        .from("queue")
        .select("id, song_id, user_id, added_by, position, source_playlist_id")
        .eq("venue_id", venueId)
        .eq("status", "queued"),
      supabaseAdmin
        .from("queue")
        .select("song_id, user_id, source_playlist_id")
        .eq("venue_id", venueId)
        .eq("status", "playing")
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("queue")
        .select("song_id, started_at, played_at")
        .eq("venue_id", venueId)
        .eq("status", "played")
        .not("user_id", "is", null)
        .gte("played_at", new Date(cutoff).toISOString()),
      // Çalınabilir katalog: çalınamaz işaretlenen (embed kapalı) ve müşteriye
      // kapatılmış şarkılar girmez.
      fetchAllRows<{ song_id: string }>((from, to) =>
        supabaseAdmin
          .from("venue_songs")
          .select("song_id, songs!inner(embeddable)")
          .eq("venue_id", venueId)
          .eq("in_venue_list", true)
          .eq("songs.embeddable", true)
          .order("song_id", { ascending: true })
          .range(from, to)
      ),
    ]);

  const queued = queuedRows ?? [];
  const current = queued.length;

  // Tavanı aşan otomatik satırlar budanır (müşterinin ve adminin elle eklediği
  // satırlara dokunulmaz — added_by filtresi). Budanan satır hiç çalmadan
  // düştüğü için tüketimi de geri alınır, yoksa şarkı bu turu ıskalardı.
  if (current > QUEUE_CAP) {
    const excess = current - QUEUE_CAP;
    const autoFills = queued
      .filter((r) => r.user_id === null && r.added_by === AUTO_ADDED_BY)
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
      .slice(0, excess);

    if (autoFills.length > 0) {
      await Promise.all(
        chunk(autoFills.map((r) => r.id)).map((ids) =>
          supabaseAdmin.from("queue").update({ status: "removed" }).in("id", ids)
        )
      );
      await unconsumeRows(venueId, autoFills);
    }
    return;
  }

  const capacity = QUEUE_CAP - current;
  if (capacity <= 0) return;

  // Song IDs already in queue — don't add duplicates. Exclude the playing song.
  const excludeIds = new Set(queued.map((r) => r.song_id));
  if (playingNow?.song_id) excludeIds.add(playingNow.song_id);

  const cooldownIds = new Set(
    (recentUserPlays ?? [])
      .filter((r) => new Date(r.started_at ?? r.played_at).getTime() >= cutoff)
      .map((r) => r.song_id)
  );
  // Çalmakta olan müşteri şarkısı da kilitli (zaten excludeIds'de ama bittiğinde
  // bir sonraki dolumda played satırı üzerinden yakalanır)
  if (playingNow?.user_id && playingNow.song_id) cooldownIds.add(playingNow.song_id);

  // Otomatik çalma önce playlist kuyruğundan geçer (0037): sıraya alınmış listeler
  // queue_position sırasıyla ve SONUNA KADAR tüketilir; çalıp biten liste
  // kuyruktan düşer (kuyrukta kalan son liste hariç — o baştan çalar).
  const catalogEligible = new Set((venueSongs ?? []).map((vs) => vs.song_id));
  // Yalnızca OTOMATİK satırlar sayılır: elle sıraya eklenen blok (added_by
  // 'admin') listenin rotasyon ilerlemesine karışmaz — tüketilmiş sayılmaz,
  // "liste bitti mi" kararını da geciktirmez.
  const pendingLists = new Set(
    queued
      .filter((r) => r.added_by === AUTO_ADDED_BY)
      .map((r) => r.source_playlist_id)
      .filter((id): id is string => !!id)
  );
  const rotationPicks =
    (await pickFromRotation(venueId, capacity, {
      catalogEligible,
      excludeIds,
      cooldownIds,
      pendingLists,
      playingList: playingNow?.source_playlist_id ?? null,
      queuedNow: current,
    })) ?? [];

  const picks: { songId: string; playlistId: string | null }[] = [...rotationPicks];

  // Kuyrukta liste yoksa — ya da kuyruktakilerden şu an şarkı çıkmadıysa (hepsi
  // kuyrukta bekliyor / 30 dk kilidinde) — kuyruk QUEUE_FLOOR'a kadar tüm
  // katalogdan karışık doldurulur. Bunlar source_playlist_id'siz girer ve
  // "tüketilmiş" sayılmaz: kilit açılınca liste kaldığı yerden devam eder.
  const needed = QUEUE_FLOOR - current;
  if (picks.length < needed) {
    const alreadyPicked = new Set(picks.map((p) => p.songId));
    const eligible = (venueSongs ?? [])
      .map((vs) => vs.song_id)
      .filter((id) => !excludeIds.has(id) && !alreadyPicked.has(id));

    // Cooldown'daki şarkılar elenir; ama katalog küçük olup hepsi elenirse müzik
    // susmasın diye cooldown yok sayılır (kuyruğa/sahneye çıkma engeli hep geçerli)
    const fresh = eligible.filter((id) => !cooldownIds.has(id));
    const candidates = fresh.length > 0 ? fresh : eligible;

    shuffleInPlace(candidates);
    for (const songId of candidates.slice(0, needed - picks.length)) {
      picks.push({ songId, playlistId: null });
    }
  }

  await insertAutoRows(venueId, picks);
}

// --- Elle sıra ("Sıraya ekle") -----------------------------------------------
//
// Spotify'daki "Sıraya ekle" ile aynı: eklenen şarkı/liste ÇALAN ŞARKIDAN HEMEN
// SONRA çalar, çalan liste kesilmez — sadece beklemeye geçer ve blok bitince
// kaldığı yerden devam eder.
//
// Sıralama pozisyon bantlarıyla kurulur (bkz. queue okuma sırası: priority desc,
// position asc):
//   0            → müşterinin öncelikli şarkısı
//   1..N         → müşterinin normal şarkıları        (request_song, 0005)
//   5001..6999   → ELLE EKLENEN TEKLİ ŞARKILAR       (burası)
//   7001..8999   → SIRAYA EKLENEN PLAYLIST'LER       (burası)
//   9001+        → çalan listenin otomatik doldurması (insertAutoRows)
//
// Müşterinin jetonla aldığı sıra bu yüzden hiç bozulmaz: elle eklenen her şey
// onların ARKASINA girer.
//
// Elle sıra İKİ ŞERİTTİR ve tekliler her zaman listelerin üstünde çalar: sıraya
// bir liste eklenmişken tek şarkı eklenirse o şarkı listenin ilk şarkısından
// ÖNCE çalar. Her şerit kendi içinde FIFO'dur — yeni eklenen, aynı şeritte daha
// önce eklenenlerin arkasına girer.
export const MANUAL_POSITION_BASE = 5000;
const MANUAL_LIST_BASE = 7000;
// Şeridin tavanı: buraya dayanırsa şerit tabana sıkıştırılır (aşağıya bak)
const MANUAL_BAND_SIZE = 2000;

// Elle sıraya eklenen satırlar kuyruğun "manuel" bloğudur: added_by='admin' ve
// user_id null. Otomatik dolum bunları ne budar ne de tüketilmiş sayar.
const isManualRow = (row: { user_id: string | null; added_by: string }) =>
  row.user_id === null && row.added_by === ADMIN_ADDED_BY;

/**
 * Şarkıları elle sıranın ilgili ŞERİDİNİN sonuna ekler: playlistId verilirse
 * "sıraya eklenen listeler" şeridine, verilmezse teklilerin şeridine. Tekliler
 * listelerin üstünde çalar, her şerit kendi içinde ekleme sırasını korur.
 * Zaten kuyrukta olan şarkı yeniden eklenebilir (admin bilerek ekliyor).
 * Dönen sayı gerçekten eklenen satır sayısıdır.
 *
 * playlistId yalnızca gösterim için taşınır (panelde "night · sırada"); rotasyon
 * muhasebesine girmez — tüketim yalnızca otomatik satırlarla işlenir.
 */
export async function enqueueManual(
  venueId: string,
  songIds: string[],
  playlistId: string | null
): Promise<number> {
  if (songIds.length === 0) return 0;

  const { data: existing } = await supabaseAdmin
    .from("queue")
    .select("song_id, position, user_id, added_by, status, source_playlist_id")
    .eq("venue_id", venueId)
    .in("status", ["queued", "playing"]);

  // Tekrar ENGELLENMEZ: admin bilerek ekliyor. Zaten kuyrukta olan (hatta
  // sahnede çalan) bir şarkı da sıraya alınabilir — o zaman iki kez çalar.
  // Otomatik dolum kendi bloğuna aynı şarkıyı ikinci kez koymaz (excludeIds),
  // bu kural yalnızca elle ekleme için gevşetilmiştir.
  const rows = existing ?? [];

  // Tavan: elle ekleme otomatik dolumdan ÖNCELİKLİDİR. Kuyruk tavana dayanmışsa
  // yer açmak için çalan listenin en sondaki otomatik satırları düşürülür —
  // onlar zaten kuyruk eridikçe yeniden seçilir. Müşteri satırlarına ve daha
  // önce elle eklenmişlere dokunulmaz.
  const queuedRows = rows.filter((r) => r.status === "queued");
  const picked = songIds.slice(0, QUEUE_CAP);
  const overflow = queuedRows.length + picked.length - QUEUE_CAP;
  if (overflow > 0) {
    const victims = queuedRows
      .filter((r) => r.user_id === null && r.added_by === AUTO_ADDED_BY)
      .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
      .slice(0, overflow);
    if (victims.length > 0) {
      await Promise.all(
        chunk(victims.map((r) => r.song_id)).map((ids) =>
          supabaseAdmin
            .from("queue")
            .update({ status: "removed" })
            .eq("venue_id", venueId)
            .eq("status", "queued")
            .eq("added_by", AUTO_ADDED_BY)
            .in("song_id", ids)
        )
      );
      // Hiç çalmadan düştüler: tüketim de geri alınır, yoksa turu ıskalarlar
      await unconsumeRows(venueId, victims);
    }
  }
  if (picked.length === 0) return 0;

  // Şerit seçimi: tekli eklemeler (playlistId yok) üst şeride, sıraya eklenen
  // listeler alt şeride girer. Yalnızca KENDİ şeridindeki satırlar sayılır —
  // yani liste eklemek teklilerin yerini, tekli eklemek listelerin yerini
  // değiştirmez. (Admin bir satırı sürükleyip otomatik bloğun arasına taşımış
  // olabilir; bantın dışına çıkmış satırlar hesaba katılmaz.)
  const base = playlistId ? MANUAL_LIST_BASE : MANUAL_POSITION_BASE;
  const bandTop = base + MANUAL_BAND_SIZE;
  const laneRows = queuedRows
    .filter((r) => {
      const pos = r.position ?? 0;
      return isManualRow(r) && pos > base && pos < bandTop;
    })
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  let lastManual = laneRows.length > 0 ? laneRows[laneRows.length - 1].position ?? base : base;

  // Şerit tavanına dayanıldıysa bekleyen satırlar tabana sıkıştırılır. Kuyruk
  // tavanı 500 olduğu için pratikte buraya girilmez; girilirse de sıra korunur.
  if (lastManual + picked.length >= bandTop) {
    await Promise.all(
      laneRows.map((r, i) =>
        supabaseAdmin
          .from("queue")
          .update({ position: base + 1 + i })
          .eq("venue_id", venueId)
          .eq("song_id", r.song_id)
          .eq("status", "queued")
          .eq("added_by", ADMIN_ADDED_BY)
      )
    );
    lastManual = base + laneRows.length;
  }

  const { error } = await supabaseAdmin.from("queue").insert(
    picked.map((songId, i) => ({
      venue_id: venueId,
      song_id: songId,
      user_id: null,
      added_by: ADMIN_ADDED_BY,
      tokens_spent: 0,
      priority: false,
      position: lastManual + 1 + i,
      status: "queued",
      source_playlist_id: playlistId,
    }))
  );
  if (error) throw new Error(error.message);
  return picked.length;
}

/**
 * "Sırayı temizle": yalnızca ELLE eklenmiş satırları düşürür. Çalan listenin
 * otomatik şarkılarına, müşterinin jetonla aldığı sıraya ve sahnedeki şarkıya
 * dokunmaz. playlistId verilirse yalnızca o listeden eklenmiş blok silinir.
 *
 * Dolum YAPMAZ — çağıran taraf boşalan yeri kapatmak için fillQueue'yu (tercihen
 * yanıttan sonra) çalıştırmalı.
 */
export async function clearManualQueue(venueId: string, playlistId?: string): Promise<void> {
  const query = supabaseAdmin
    .from("queue")
    .update({ status: "removed" })
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .eq("added_by", ADMIN_ADDED_BY);

  const { error } = playlistId ? await query.eq("source_playlist_id", playlistId) : await query;
  if (error) throw new Error(error.message);
}

/**
 * Bir listenin sıraya eklenebilir şarkıları: liste sırasıyla (karıştırmalıysa
 * rastgele), çalınamaz/katalogdan düşmüş olanlar elenmiş.
 *
 * 30 dk kilidi UYGULANMAZ — admin düğmeye bilerek basıyor (pickPlaylistOpener
 * ile aynı gerekçe).
 */
export async function playlistSongsForQueue(
  venueId: string,
  playlistId: string
): Promise<string[]> {
  const [{ data: playlist }, members] = await Promise.all([
    supabaseAdmin
      .from("playlists")
      .select("shuffle")
      .eq("id", playlistId)
      .eq("venue_id", venueId)
      .maybeSingle(),
    fetchAllRows<{ song_id: string }>((from, to) =>
      supabaseAdmin
        .from("playlist_songs")
        .select("song_id, position, added_at")
        .eq("venue_id", venueId)
        .eq("playlist_id", playlistId)
        .order("position", { ascending: true })
        .order("added_at", { ascending: true })
        .order("song_id", { ascending: true })
        .range(from, to)
    ),
  ]);

  if (!playlist) return [];
  const memberIds = (members.data ?? []).map((m) => m.song_id);
  if (memberIds.length === 0) return [];

  // Uygunluk yalnızca listenin şarkıları için sorulur; parçalar aynı anda gider
  const results = await Promise.all(
    chunk(memberIds, 200).map((ids) =>
      supabaseAdmin
        .from("venue_songs")
        .select("song_id, songs!inner(embeddable, youtube_video_id)")
        .eq("venue_id", venueId)
        .eq("in_venue_list", true)
        .eq("songs.embeddable", true)
        .not("songs.youtube_video_id", "is", null)
        .in("song_id", ids)
    )
  );

  const eligible = new Set(results.flatMap((r) => (r.data ?? []).map((vs) => vs.song_id)));
  const ordered = memberIds.filter((id) => eligible.has(id));
  return playlist.shuffle ? shuffleInPlace(ordered) : ordered;
}

// Paneldeki play tuşu: imleç bu listeye atlar ve liste baştan başlar.
//
// O ana kadar çalmakta olan liste KUYRUKTAN DÜŞER: sırası gelmiş, çalmış ve elle
// kesilmiştir — kuyrukta kalsaydı yeni liste bitince tekrar en başa gelirdi.
// Böylece "A çalıyor, B sırada" iken C'ye basılınca C çalar ve arkasından B gelir.
// Düşen liste silinmez, yalnızca sıradan çıkar; mekan isterse tekrar sıraya alır.
//
// Kuyrukta kalanların sırası korunur, yalnızca 1..n olarak sıkıştırılır.
// Liste kuyrukta değilse önce kuyruğa alınır: play "sıraya ekle + şimdi çal".
//
// refillQueue=false: imleç taşınır ama bekleyen otomatik şarkılar yenilenmez.
// Çağıran taraf dolumu yanıttan SONRA (after) çalıştırmak istediğinde kullanılır —
// panel düğmesi 20+ DB turunu beklemesin diye.
export async function playPlaylistNow(
  venueId: string,
  playlistId: string,
  options?: { refillQueue?: boolean }
): Promise<void> {
  const [{ data: playlist }, { data: state }, { data: queued }] = await Promise.all([
    supabaseAdmin
      .from("playlists")
      .select("id, queue_position")
      .eq("id", playlistId)
      .eq("venue_id", venueId)
      .maybeSingle(),
    supabaseAdmin
      .from("playlist_rotation")
      .select("playlist_id, cycle")
      .eq("venue_id", venueId)
      .maybeSingle(),
    supabaseAdmin
      .from("playlists")
      .select("id, queue_position")
      .eq("venue_id", venueId)
      .not("queue_position", "is", null)
      .order("queue_position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (!playlist) return;

  const cycle = state?.cycle ?? 1;
  const queue = queued ?? [];

  // Şu an çalan liste: imleçteki liste kuyruktaysa o, değilse (imleç boş ya da
  // liste kuyruktan çıkmış) dolum kuyruğun başından başlayacağı için ilk liste.
  const playing = queue.find((p) => p.id === state?.playlist_id) ?? queue[0] ?? null;
  const dropId = playing && playing.id !== playlistId ? playing.id : null;

  // Kalan kuyruk + hedef: hedef zaten kuyruktaysa yerinde kalır, değilse sona girer
  const remaining = queue.filter((p) => p.id !== dropId);
  if (!remaining.some((p) => p.id === playlistId)) {
    remaining.push({ id: playlistId, queue_position: Number.MAX_SAFE_INTEGER });
  }

  await Promise.all([
    ...remaining
      .map((p, i) => ({ id: p.id, position: i + 1, current: p.queue_position }))
      .filter((p) => p.current !== p.position)
      .map((p) =>
        supabaseAdmin
          .from("playlists")
          .update({ queue_position: p.position })
          .eq("id", p.id)
          .eq("venue_id", venueId)
      ),
    ...(dropId
      ? [
          supabaseAdmin
            .from("playlists")
            .update({ queue_position: null })
            .eq("id", dropId)
            .eq("venue_id", venueId),
          // İlerlemesi de silinir: sonradan tekrar sıraya alınırsa kaldığı yerden
          // değil baştan çalsın (play_once'ta olduğu gibi).
          supabaseAdmin
            .from("playlist_rotation_consumed")
            .delete()
            .eq("venue_id", venueId)
            .eq("playlist_id", dropId),
        ]
      : []),
    // Liste baştan çalsın: bu turda tüketilmiş sayılan şarkıları serbest bırak.
    // Yukarıdaki güncellemelerden bağımsız (hedef liste dropId olamaz), o yüzden
    // ayrı bir tur beklemeden aynı partide gider.
    supabaseAdmin
      .from("playlist_rotation_consumed")
      .delete()
      .eq("venue_id", venueId)
      .eq("cycle", cycle)
      .eq("playlist_id", playlistId),
    supabaseAdmin.from("playlist_rotation").upsert(
      { venue_id: venueId, playlist_id: playlistId, cycle, updated_at: new Date().toISOString() },
      { onConflict: "venue_id" }
    ),
  ]);

  // Kuyrukta bekleyen otomatik şarkılar yeni listeden yeniden seçilir. Sahnede
  // çalan şarkıya, müşteri isteklerine ve adminin elle eklediklerine dokunulmaz —
  // yani hiçbir şarkı yarıda kesilmez, sıradaki şarkıdan itibaren bu liste çalar.
  if (options?.refillQueue === false) return;
  await resetAutoQueue(venueId);
}

// Play tuşuna basılınca SAHNEYE çıkacak şarkı: listenin ilk şarkısı, liste
// karıştırmalıysa rastgele bir şarkısı.
//
// 30 dk kilidi burada UYGULANMAZ: kilit "otomatik dolum bunu seçmesin" kuralıdır,
// admin düğmeye bilerek basmıştır. Çalınamaz olanlar (katalogdan düşmüş, embed'e
// kapalı) yine elenir — sahnede sessizlik olmasın.
//
// null dönerse listede çalınabilir şarkı yok: çağıran taraf sahneyi olduğu gibi
// bırakıp yalnızca kuyruğu tazeler.
export async function pickPlaylistOpener(
  venueId: string,
  playlistId: string
): Promise<string | null> {
  const [{ data: playlist }, { data: members }] = await Promise.all([
    supabaseAdmin
      .from("playlists")
      .select("shuffle")
      .eq("id", playlistId)
      .eq("venue_id", venueId)
      .maybeSingle(),
    // Sıra pickFromRotation ile birebir aynı — "listenin ilk şarkısı" iki yerde
    // farklı şarkı olmasın
    fetchAllRows<{ song_id: string }>((from, to) =>
      supabaseAdmin
        .from("playlist_songs")
        .select("song_id, position, added_at")
        .eq("venue_id", venueId)
        .eq("playlist_id", playlistId)
        .order("position", { ascending: true })
        .order("added_at", { ascending: true })
        .order("song_id", { ascending: true })
        .range(from, to)
    ),
  ]);

  if (!playlist) return null;

  const memberIds = (members ?? []).map((m) => m.song_id);
  if (memberIds.length === 0) return null;

  // Uygunluk YALNIZCA listenin şarkıları için sorulur. Tüm katalogu sayfalayarak
  // çekmek düğmeyi gözle görülür şekilde geciktiriyordu (3000 şarkılık mekanda
  // arka arkaya 3-4 tur); burada 200'erlik parçalar aynı anda gider.
  const CHUNK = 200;
  const chunks: string[][] = [];
  for (let i = 0; i < memberIds.length; i += CHUNK) chunks.push(memberIds.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((ids) =>
      supabaseAdmin
        .from("venue_songs")
        .select("song_id, songs!inner(embeddable, youtube_video_id)")
        .eq("venue_id", venueId)
        .eq("in_venue_list", true)
        .eq("songs.embeddable", true)
        .not("songs.youtube_video_id", "is", null)
        .in("song_id", ids)
    )
  );

  const eligible = new Set(results.flatMap((r) => (r.data ?? []).map((vs) => vs.song_id)));
  const candidates = memberIds.filter((id) => eligible.has(id));
  if (candidates.length === 0) return null;

  return playlist.shuffle
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : candidates[0];
}

// "Listenin 4. şarkısını şimdi çal" dendiğinde rotasyon imlecini o noktaya
// taşır: liste çalan liste olur, ondan ÖNCEKİ şarkılar bu turda çalınmış sayılır,
// SONRAKİLER (5, 6, 7...) sıraya girer. Şarkının kendisi de tüketilmiş işaretlenir
// — sahneye çıkıyor, kuyruğa ikinci kez düşmemeli.
//
// Liste kuyrukta değilse önce kuyruğa alınır (play tuşundaki gibi): aksi halde
// imleç okunmaz ve dolum başka listeden devam ederdi.
//
// Dolum YAPMAZ; çağıran taraf önce clearAutoQueue, sonra bu, en son fillQueue
// sırasını izlemeli.
export async function jumpPlaylistCursorTo(
  venueId: string,
  playlistId: string,
  songId: string
): Promise<boolean> {
  const [{ data: playlist }, { data: state }] = await Promise.all([
    supabaseAdmin
      .from("playlists")
      .select("id, queue_position, shuffle")
      .eq("id", playlistId)
      .eq("venue_id", venueId)
      .maybeSingle(),
    supabaseAdmin
      .from("playlist_rotation")
      .select("cycle")
      .eq("venue_id", venueId)
      .maybeSingle(),
  ]);

  if (!playlist) return false;

  // pickFromRotation ile BİREBİR aynı sıralama — farklı olursa "4'ten sonrası"
  // başka bir şarkı kümesi olur
  const members = await fetchAllRows<{ song_id: string }>((from, to) =>
    supabaseAdmin
      .from("playlist_songs")
      .select("song_id, position, added_at")
      .eq("venue_id", venueId)
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true })
      .order("added_at", { ascending: true })
      .order("song_id", { ascending: true })
      .range(from, to)
  );

  const ids = (members.data ?? []).map((m) => m.song_id);
  const index = ids.indexOf(songId);
  if (index < 0) return false;

  const cycle = state?.cycle ?? 1;

  // Karıştırmalı listede "öncesi/sonrası" diye bir şey yoktur: yalnızca seçilen
  // şarkı tüketilmiş sayılır, listenin o turdaki ilerlemesi olduğu gibi kalır.
  // (Sıra numarasına göre silseydik listenin yarısı hiç çalmadan turu kaçırırdı.)
  //
  // Sıralı listede ilerleme baştan yazılır: seçilen şarkıya kadarı (kendisi
  // dahil) çalınmış, sonrası çalınmamış sayılır.
  if (!playlist.shuffle) {
    await supabaseAdmin
      .from("playlist_rotation_consumed")
      .delete()
      .eq("venue_id", venueId)
      .eq("playlist_id", playlistId)
      .eq("cycle", cycle);
  }

  await supabaseAdmin.from("playlist_rotation_consumed").upsert(
    (playlist.shuffle ? [songId] : ids.slice(0, index + 1)).map((id) => ({
      venue_id: venueId,
      playlist_id: playlistId,
      song_id: id,
      cycle,
    })),
    { onConflict: "venue_id,playlist_id,cycle,song_id", ignoreDuplicates: true }
  );

  if (playlist.queue_position === null) {
    await supabaseAdmin
      .from("playlists")
      .update({ queue_position: await nextQueuePosition(venueId) })
      .eq("id", playlistId)
      .eq("venue_id", venueId);
  }

  await supabaseAdmin.from("playlist_rotation").upsert(
    { venue_id: venueId, playlist_id: playlistId, cycle, updated_at: new Date().toISOString() },
    { onConflict: "venue_id" }
  );

  return true;
}

// Kuyruğun sonundaki yer. Kuyruk boşsa 1'den başlar.
export async function nextQueuePosition(venueId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("playlists")
    .select("queue_position")
    .eq("venue_id", venueId)
    .not("queue_position", "is", null)
    .order("queue_position", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.queue_position ?? 0) + 1;
}

// Seçilen şarkıları kuyruğun otomatik bölümüne yazar. Konum, mevcut en yüksek
// otomatik satırın üstünden devam eder — müşteri satırlarıyla çakışmasın diye
// taban AUTO_POSITION_BASE.
async function insertAutoRows(
  venueId: string,
  picks: { songId: string; playlistId: string | null }[]
): Promise<void> {
  if (picks.length === 0) return;

  const { data: lastAuto } = await supabaseAdmin
    .from("queue")
    .select("position")
    .eq("venue_id", venueId)
    .eq("status", "queued")
    .is("user_id", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startPos = Math.max(lastAuto?.position ?? AUTO_POSITION_BASE, AUTO_POSITION_BASE) + 1;

  await supabaseAdmin.from("queue").insert(
    picks.map((pick, i) => ({
      venue_id: venueId,
      song_id: pick.songId,
      user_id: null,
      added_by: AUTO_ADDED_BY,
      tokens_spent: 0,
      priority: false,
      position: startPos + i,
      status: "queued",
      source_playlist_id: pick.playlistId,
    }))
  );
}
