import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Sheet } from '../components/Sheet'
import { useCategories } from '../db/queries'
import {
  addCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from '../db/mutations'
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
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const orderRef = useRef<string[] | null>(null)
  const draggingIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const canAdd = name.trim().length > 0 && icon.length > 0
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const displayedCategories = draftOrder
    ? [
        ...draftOrder.flatMap((id) => {
          const category = categoryById.get(id)
          return category ? [category] : []
        }),
        ...categories.filter((category) => !draftOrder.includes(category.id)),
      ]
    : categories

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

  function startReorder(id: string, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const order = displayedCategories.map((category) => category.id)
    orderRef.current = order
    draggingIdRef.current = id
    setDraftOrder(order)
    setDraggingId(id)
  }

  function continueReorder(event: ReactPointerEvent<HTMLButtonElement>) {
    const id = draggingIdRef.current
    const current = orderRef.current
    if (!id || !current) return

    const scroller = scrollRef.current
    if (scroller) {
      const bounds = scroller.getBoundingClientRect()
      if (event.clientY < bounds.top + 44) scroller.scrollTop -= 12
      if (event.clientY > bounds.bottom - 44) scroller.scrollTop += 12
    }

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-category-id]')
      ?.dataset.categoryId
    if (!target || target === id) return

    const from = current.indexOf(id)
    const to = current.indexOf(target)
    if (from < 0 || to < 0) return

    const next = [...current]
    next.splice(from, 1)
    next.splice(to, 0, id)
    orderRef.current = next
    setDraftOrder(next)
  }

  async function finishReorder(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingIdRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const order = orderRef.current
    draggingIdRef.current = null
    setDraggingId(null)
    try {
      if (order) await reorderCategories(order)
    } finally {
      orderRef.current = null
      setDraftOrder(null)
    }
  }

  async function moveWithKeyboard(id: string, direction: -1 | 1) {
    const order = displayedCategories.map((category) => category.id)
    const from = order.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= order.length) return
    ;[order[from], order[to]] = [order[to], order[from]]
    orderRef.current = order
    setDraftOrder(order)
    try {
      await reorderCategories(order)
    } finally {
      orderRef.current = null
      setDraftOrder(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div
        ref={scrollRef}
        className="safe-bottom hide-scrollbar max-h-[80vh] overflow-y-auto px-4 pt-2 pb-4"
      >
        <div className="pb-4 text-center text-[15px] font-medium">Categories</div>

        <div className="overflow-hidden rounded-2xl bg-surface-2">
          {displayedCategories.map((category, i) => (
            <CategoryRow
              key={category.id}
              category={category}
              divided={i > 0}
              dragging={draggingId === category.id}
              confirming={pendingDelete === category.id}
              onConfirmDelete={() => setPendingDelete(category.id)}
              onCancelDelete={() => setPendingDelete(null)}
              onDelete={async () => {
                await deleteCategory(category.id)
                setPendingDelete(null)
              }}
              onRename={(value) => void updateCategory(category.id, { name: value })}
              onChangeIcon={(value) => void updateCategory(category.id, { icon: value })}
              onReorderStart={(event) => startReorder(category.id, event)}
              onReorderMove={continueReorder}
              onReorderEnd={(event) => void finishReorder(event)}
              onReorderKey={(direction) => void moveWithKeyboard(category.id, direction)}
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
          Drag the handle to set the order used when adding an expense. Tap any emoji
          to change it. The nine built-in category names are fixed and cannot be
          removed; your own categories can be renamed or deleted. Deleted category
          expenses fall back to Other.
        </p>
      </div>
    </Sheet>
  )
}

function CategoryRow({
  category,
  divided,
  dragging,
  confirming,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onRename,
  onChangeIcon,
  onReorderStart,
  onReorderMove,
  onReorderEnd,
  onReorderKey,
}: {
  category: Category
  divided: boolean
  dragging: boolean
  confirming: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onChangeIcon: (icon: string) => void
  onReorderStart: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onReorderKey: (direction: -1 | 1) => void
}) {
  const [draft, setDraft] = useState(category.name)
  const builtIn = isBuiltInCategory(category.id)

  return (
    <div
      data-category-id={category.id}
      className={[
        'flex items-center gap-2.5 px-3 py-2.5 transition-colors',
        divided ? 'border-t border-hairline' : '',
        dragging ? 'bg-surface-3' : '',
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

      {builtIn ? (
        <span className="min-w-0 flex-1 truncate text-[15px]">{category.name}</span>
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim()
            if (next && next !== category.name) onRename(next)
            else setDraft(category.name)
          }}
          aria-label={`Rename ${category.name}`}
          maxLength={24}
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
        />
      )}

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

      <button
        type="button"
        aria-label={`Reorder ${category.name}`}
        aria-roledescription="sortable"
        onPointerDown={onReorderStart}
        onPointerMove={onReorderMove}
        onPointerUp={onReorderEnd}
        onPointerCancel={onReorderEnd}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            onReorderKey(-1)
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onReorderKey(1)
          }
        }}
        className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-faint active:cursor-grabbing active:bg-surface-3"
        style={{ touchAction: 'none' }}
      >
        <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden>
          <circle cx="4" cy="4" r="1.25" />
          <circle cx="10" cy="4" r="1.25" />
          <circle cx="4" cy="9" r="1.25" />
          <circle cx="10" cy="9" r="1.25" />
          <circle cx="4" cy="14" r="1.25" />
          <circle cx="10" cy="14" r="1.25" />
        </svg>
      </button>
    </div>
  )
}
