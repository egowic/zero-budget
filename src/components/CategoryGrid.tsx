import type { Category } from '../db/schema'

interface CategoryGridProps {
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/**
 * Always visible on the entry sheet, never behind a navigation step.
 *
 * Tapping the selected category clears it — categories are optional, and
 * making that reversible in one tap is what keeps them optional in practice
 * rather than only in principle.
 */
export function CategoryGrid({ categories, selectedId, onSelect }: CategoryGridProps) {
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-3">
      {categories.map((category) => {
        const selected = category.id === selectedId
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(selected ? null : category.id)}
            className="flex flex-col items-center gap-1.5 py-0.5"
          >
            <span
              className={[
                'flex h-[46px] w-[46px] items-center justify-center rounded-full',
                'text-[21px] transition-all duration-150',
                selected ? 'scale-105' : 'scale-100',
              ].join(' ')}
              style={{
                background: selected ? category.color : 'var(--color-surface-3)',
                boxShadow: selected ? `0 0 0 3px ${category.color}33` : undefined,
              }}
            >
              {category.icon}
            </span>
            <span
              className={[
                'text-[11px] leading-tight transition-colors',
                selected ? 'text-text' : 'text-faint',
              ].join(' ')}
            >
              {category.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
