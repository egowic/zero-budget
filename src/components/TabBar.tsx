export type Tab = 'timeline' | 'budgets'

interface TabBarProps {
  tab: Tab
  onTabChange: (tab: Tab) => void
  onAdd: () => void
}

/**
 * Two tabs with the add button between them. Centre position is deliberate:
 * it is the only control reachable by either thumb without shifting grip, and
 * adding an expense is what this app gets opened for.
 */
export function TabBar({ tab, onTabChange, onAdd }: TabBarProps) {
  return (
    <nav className="app-tabbar fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink via-ink/92 to-transparent" />

      <div className="safe-bottom relative flex items-center justify-around px-8 pt-2 pb-2">
        <TabButton
          label="Activity"
          active={tab === 'timeline'}
          onClick={() => onTabChange('timeline')}
          icon={
            <path d="M4 7h16M4 12h16M4 17h9" strokeLinecap="round" strokeWidth="1.8" />
          }
        />

        <button
          type="button"
          onClick={onAdd}
          aria-label="Add expense"
          className={[
            'flex h-[54px] w-[54px] items-center justify-center rounded-full',
            'bg-accent text-ink shadow-[0_6px_22px_rgba(0,0,0,0.5)]',
            'transition-transform duration-150 active:scale-90',
          ].join(' ')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <TabButton
          label="Budgets"
          active={tab === 'budgets'}
          onClick={() => onTabChange('budgets')}
          icon={
            <>
              <rect x="3" y="6" width="18" height="13" rx="2.5" strokeWidth="1.8" />
              <path d="M3 10h18" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
            </>
          }
        />
      </div>
    </nav>
  )
}

function TabButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-16 flex-col items-center gap-1 py-1 transition-colors duration-150',
        active ? 'text-text' : 'text-faint',
      ].join(' ')}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden
      >
        {icon}
      </svg>
      <span className="text-[10.5px]">{label}</span>
    </button>
  )
}
