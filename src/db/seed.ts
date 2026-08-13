import { db, getMeta, setMeta, type Category } from './schema'

/**
 * The built-in categories.
 *
 * Their ids are fixed constants rather than fresh UUIDs on purpose. Each
 * device seeds itself before it has ever synced, so generated ids would give
 * the second device its own copies and the merge would produce two of
 * everything. Identical ids make the upsert collapse them into one set.
 *
 * These cannot be deleted — they are the shared vocabulary every device agrees
 * on. Anything the user adds themselves is fully removable.
 */
const DEFAULTS: Pick<Category, 'id' | 'name' | 'icon' | 'color' | 'sortOrder'>[] = [
  { id: '00000000-0000-4000-8000-000000000011', name: 'Groceries',  icon: '🛒', color: '#7fc8a9', sortOrder: 0 },
  { id: '00000000-0000-4000-8000-000000000012', name: 'Dining Out', icon: '🍽️', color: '#e0a46b', sortOrder: 1 },
  { id: '00000000-0000-4000-8000-000000000013', name: 'Takeaway',   icon: '🥡', color: '#d98f6b', sortOrder: 2 },
  { id: '00000000-0000-4000-8000-000000000014', name: 'Coffee',     icon: '☕️', color: '#b08a72', sortOrder: 3 },
  { id: '00000000-0000-4000-8000-000000000015', name: 'Water',      icon: '💧', color: '#6fb6d9', sortOrder: 4 },
  { id: '00000000-0000-4000-8000-000000000016', name: 'Shopping',   icon: '🛍️', color: '#c58acb', sortOrder: 5 },
  { id: '00000000-0000-4000-8000-000000000017', name: 'Car',        icon: '🚗', color: '#7b8fd9', sortOrder: 6 },
  { id: '00000000-0000-4000-8000-000000000018', name: 'Games',      icon: '🎮', color: '#d97b9a', sortOrder: 7 },
  { id: '00000000-0000-4000-8000-000000000019', name: 'Other',      icon: '🧾', color: '#8f93a8', sortOrder: 8 },
]

export const DEFAULT_CATEGORY_IDS: ReadonlySet<string> = new Set(DEFAULTS.map((c) => c.id))

/** Where an expense lands when no category is chosen. */
export const OTHER_CATEGORY_ID = '00000000-0000-4000-8000-000000000019'

export function isBuiltInCategory(id: string): boolean {
  return DEFAULT_CATEGORY_IDS.has(id)
}

/** Ids from the first draft of the default set, retired by the v2 seed. */
const RETIRED_IDS = Array.from(
  { length: 8 },
  (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`,
)

const SEED_VERSION = 3

/**
 * Installs any built-in category that is missing, and applies one-off
 * corrections when moving between seed versions.
 *
 * Existing rows are never blindly overwritten: icons and names are editable,
 * so re-running this must not undo a change the user made deliberately.
 */
export async function seedIfEmpty(): Promise<void> {
  const seeded = await getMeta('seedVersion', 0)
  if (seeded >= SEED_VERSION) return

  const now = Date.now()

  await db.transaction('rw', db.categories, db.expenses, async () => {
    if (seeded < 2) {
      // Retire the first draft of the defaults and untag anything filed under
      // them, so no expense points at a category that no longer exists.
      for (const id of RETIRED_IDS) {
        if (!(await db.categories.get(id))) continue
        await db.categories.delete(id)
        const tagged = await db.expenses.where('categoryId').equals(id).toArray()
        for (const expense of tagged) {
          await db.expenses.update(expense.id, { categoryId: null, updatedAt: now })
        }
      }
    }

    if (seeded === 2) {
      // The box read as "parcel" rather than "miscellaneous"
      await db.categories.update(OTHER_CATEGORY_ID, { icon: '🧾', updatedAt: now })
    }

    for (const category of DEFAULTS) {
      if (await db.categories.get(category.id)) continue
      await db.categories.put({ ...category, createdAt: now, updatedAt: now, deleted: 0 })
    }
  })

  await setMeta('seedVersion', SEED_VERSION)
}
