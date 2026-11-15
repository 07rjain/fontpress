import './env.js';
import type { fonts as sqliteFonts, FontRow, Visibility } from './db.js';
export type { FontRow, Visibility } from './db.js';

async function createStore() {
  if (process.env.SUPABASE_URL) {
    const { SupabaseStore } = await import('./supabase.js');
    return new SupabaseStore();
  }
  // Never create a temporary SQLite database on a deployed function.
  if (process.env.VERCEL) throw new Error('Supabase is not configured.');
  const local = await import('./db.js');
  return {
    ...local.fonts,
    content: async (id: string) => {
      const content = local.fonts.content(id);
      return { font_data: content?.font_data ?? await local.readFontFile(id).catch(() => null), project_json: content?.project_json ?? null };
    },
    remove: async (id: string) => { local.fonts.remove(id); await local.removeFontFile(id); },
  };
}
let pending: ReturnType<typeof createStore> | undefined;
export function getStore() { return pending ??= createStore(); }

export async function cloudStore() {
  const store = await getStore();
  return 'reserve' in store ? store : null;
}
// Keep the route code independent of the persistence provider.
export const fonts = {
  get: async (id: string) => (await getStore()).get(id),
  content: async (id: string, row?: FontRow) => {
    const store = await getStore();
    return 'reserve' in store ? store.content(id, row) : store.content(id);
  },
  byOwner: async (owner: string) => (await getStore()).byOwner(owner),
  countByOwner: async (owner: string) => (await getStore()).countByOwner(owner),
  publicPage: async (query: string, limit: number, offset: number) => (await getStore()).publicPage(query, limit, offset),
  insert: async (...args: Parameters<typeof sqliteFonts.insert>) => (await getStore()).insert(...args),
  update: async (...args: Parameters<typeof sqliteFonts.update>) => (await getStore()).update(...args),
  setVisibility: async (id: string, visibility: Visibility, row: FontRow) => {
    const store = await getStore();
    if ('reserve' in store) return store.setVisibility(id, visibility, row.version);
    await store.setVisibility(id, visibility); return true;
  },
  remove: async (id: string) => (await getStore()).remove(id),
};
