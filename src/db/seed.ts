import { db, getMeta, setMeta, type Category } from './schema'

/**
 * A first-run set of categories, so the picker is never an empty screen.
 * Categories stay optional and any of these can be deleted.
 *
 * The ids are fixed constants rather than fresh UUIDs on purpose. Each device
 * seeds itself before it has ever synced, so generated ids would give the
 * second device its own eight rows and the merge would produce sixteen
 * categories. Identical ids make the upsert collapse them into one set.
 */
const DEFAULTS: Pick<Category, 'id' | 'name' | 'icon' | 'color' | 'sortOrder'>[] = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Groceries', icon: '🛒', color: '#7fc8a9', sortOrder: 0 },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Dining', icon: '🍽️', color: '#e0a46b', sortOrder: 1 },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Coffee', icon: '☕️', color: '#c08b6e', sortOrder: 2 },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Transport', icon: '🚕', color: '#7ba7d9', sortOrder: 3 },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Shopping', icon: '🛍️', color: '#c58acb', sortOrder: 4 },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Bills', icon: '🧾', color: '#8f93a8', sortOrder: 5 },
  { id: '00000000-0000-4000-8000-000000000007', name: 'Fun', icon: '🎬', color: '#e0767b', sortOrder: 6 },
  { id: '00000000-0000-4000-8000-000000000008', name: 'Health', icon: '💊', color: '#6fc4c0', sortOrder: 7 },
]

export async function seedIfEmpty(): Promise<void> {
  if (await getMeta('seeded', false)) return

  const now = Date.now()
  // `bulkPut` rather than `bulkAdd`: if a sync has already pulled these rows
  // down, seeding must not throw on the key collision.
  await db.categories.bulkPut(
    DEFAULTS.map((c) => ({ ...c, createdAt: now, updatedAt: now, deleted: 0 as const })),
  )
  await setMeta('seeded', true)
}
