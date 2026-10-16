import type { VenuePmjView } from "@/lib/pmj-playlists";

// PMJ listesi görünümlerinin tarayıcı önbelleği. Kendi listeler panel açılışında
// bir kez yüklenip bellekten süzüldüğü için anında açılıyor; PMJ görünümü ise
// tıklanınca 900 şarkıyı sunucudan istiyordu. Çubuk açılınca listeler arka
// planda buraya indirilir, görünüm önbellekten anında açılıp arkada tazelenir.

const views = new Map<string, VenuePmjView>();
const inflight = new Map<string, Promise<VenuePmjView | null>>();

export function cachedPmjView(id: string): VenuePmjView | null {
  return views.get(id) ?? null;
}

export function fetchPmjView(id: string): Promise<VenuePmjView | null> {
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = fetch(`/api/admin/pmj-playlists?id=${id}`)
    .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
      if (!ok) throw new Error(d?.error ?? "Liste yüklenemedi");
      const view = d.view as VenuePmjView;
      views.set(id, view);
      return view;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export function prefetchPmjViews(ids: string[]) {
  for (const id of ids) if (!views.has(id)) void fetchPmjView(id).catch(() => null);
}
