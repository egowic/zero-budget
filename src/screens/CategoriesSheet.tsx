import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { useCategories } from '../db/queries'
import { addCategory, deleteCategory, updateCategory } from '../db/mutations'
import { isBuiltInCategory } from '../db/seed'
import type { Category } from '../db/schema'

interface CategoriesSheetProps {
  open: boolean
  onClose: () => void
}

/** Palette offered for custom categories — muted enough to sit with the rest. */
const PALETTE = [
  '#7fc8a9', '#e0a46b', '#d98f6b', '#b08a72', '#6fb6d9',
  '#c58acb', '#7b8fd9', '#d97b9a', '#8f93a8', '#6fc4c0',
]

/** Takes the first grapheme, so a multi-codepoint emoji is not cut in half. */
function firstGrapheme(input: string): string {
  if (!input) return ''
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return [...segmenter.segment(input)][0]?.segment ?? ''
  }
  return [...input][0] ?? ''
}

export function CategoriesSheet({ open, onClose }: CategoriesSheetProps) {
  const categories = useCategories()
  const [adding, setAdding] = useState(false)
  const [icon, setIcon] = useState('')
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const canAdd = name.trim().length > 0 && icon.length > 0

  function resetForm() {
    setAdding(false)
    setIcon('')
    setName('')
    setColor(PALETTE[Math.floor(Math.random() * PALETTE.length)])
  }

  async function submit() {
    if (!canAdd) return
    await addCategory({ name, icon, color })
    resetForm()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="safe-bottom hide-scrollbar max-h-[80vh] overflow-y-auto px-4 pt-2 pb-4">
        <div className="pb-4 text-center text-[15px] font-medium">Categories</div>

        <div className="overflow-hidden rounded-2xl bg-surface-2">
          {categories.map((category, i) => (
            <CategoryRow
              key={category.id}
              category={category}
              divided={i > 0}
              confirming={pendingDelete === category.id}
              onConfirmDelete={() => setPendingDelete(category.id)}
              onCancelDelete={() => setPendingDelete(null)}
              onDelete={async () => {
                await deleteCategory(category.id)
                setPendingDelete(null)
              }}
              onRename={(value) => void updateCategory(category.id, { name: value })}
              onChangeIcon={(value) => void updateCategory(category.id, { icon: value })}
            />
          ))}
        </div>

        {adding ? (
          <div className="mt-3 rounded-2xl bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <input
                value={icon}
                onChange={(e) => setIcon(firstGrapheme(e.target.value))}
                placeholder="🙂"
                aria-label="Emoji"
                className="h-[46px] w-[46px] shrink-0 rounded-full text-center text-[21px] outline-none"
                style={{ background: color }}
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Category name"
                maxLength={24}
                autoFocus
                className="h-[46px] w-full rounded-xl bg-surface-3 px-3.5 text-[15px] outline-none placeholder:text-faint"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {PALETTE.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Colour ${swatch}`}
                  onClick={() => setColor(swatch)}
                  className="h-7 w-7 rounded-full transition-transform"
                  style={{
                    background: swatch,
                    boxShadow: swatch === color ? `0 0 0 2.5px var(--color-surface-2), 0 0 0 4px ${swatch}` : undefined,
                  }}
                />
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="h-[44px] flex-1 rounded-xl bg-surface-3 text-[14.5px] text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canAdd}
                className={[
                  'h-[44px] flex-1 rounded-xl text-[14.5px] font-medium',
                  canAdd ? 'bg-accent text-ink' : 'bg-surface-3 text-faint',
                ].join(' ')}
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-3 h-[48px] w-full rounded-2xl bg-surface-2 text-[14.5px] text-muted active:bg-surface-3"
          >
            + New category
          </button>
        )}

        <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-faint">
          Tap any emoji or name to change it. The nine built-in categories cannot be
          removed; deleting one of your own keeps its expenses, which fall back to
          Other.
        </p>
      </div>
    </Sheet>
  )
}

function CategoryRow({
  category,
  divided,
  confirming,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onRename,
  onChangeIcon,
}: {
  category: Category
  divided: boolean
  confirming: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onChangeIcon: (icon: string) => void
}) {
  const [draft, setDraft] = useState(category.name)
  const builtIn = isBuiltInCategory(category.id)

  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-2.5',
        divided ? 'border-t border-hairline' : '',
      ].join(' ')}
    >
      {/* Editable even for built-ins: they cannot be removed, but nothing is
          gained by forcing someone to live with an emoji they dislike. */}
      <input
        value={category.icon}
        onChange={(e) => {
          const next = firstGrapheme(e.target.value)
          if (next && next !== category.icon) onChangeIcon(next)
        }}
        aria-label={`${category.name} emoji`}
        className="h-[38px] w-[38px] shrink-0 rounded-full text-center text-[18px] outline-none"
        style={{ background: `${category.color}2b` }}
      />

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim()
          if (next && next !== category.name) onRename(next)
          else setDraft(category.name)
        }}
        maxLength={24}
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
      />

      {builtIn ? null : confirming ? (
        <span className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onCancelDelete}
            className="rounded-lg bg-surface-3 px-2.5 py-1.5 text-[12.5px] text-muted"
          >
            Keep
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-over px-2.5 py-1.5 text-[12.5px] font-medium text-ink"
          >
            Delete
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={onConfirmDelete}
          aria-label={`Delete ${category.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint active:bg-surface-3"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  )
}
