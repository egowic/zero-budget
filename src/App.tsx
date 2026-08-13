import { useEffect, useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { Timeline } from './screens/Timeline'
import { Budgets } from './screens/Budgets'
import { ExpenseSheet } from './screens/ExpenseSheet'
import { SettingsSheet } from './screens/SettingsSheet'
import { CategoriesSheet } from './screens/CategoriesSheet'
import { Login } from './screens/Login'
import { isSyncConfigured } from './sync/client'
import { sync } from './sync/engine'
import { useAuthSession } from './sync/useAuthSession'

export default function App() {
  const auth = useAuthSession()

  useEffect(() => {
    if (auth.session?.user.id) void sync()
  }, [auth.session?.user.id])

  if (isSyncConfigured && auth.loading) {
    return <div className="min-h-[100dvh] bg-ink" aria-label="Loading" />
  }

  if (isSyncConfigured && !auth.session?.user.email) {
    return <Login />
  }

  return <SignedInApp accountEmail={auth.session?.user.email ?? null} />
}

function SignedInApp({ accountEmail }: { accountEmail: string | null }) {
  const [tab, setTab] = useState<Tab>('timeline')
  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false)

  return (
    <div className="min-h-full bg-ink">
      {tab === 'timeline' ? (
        <Timeline
          onCreateBudget={() => {
            setTab('budgets')
            setBudgetSheetOpen(true)
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <Budgets createOpen={budgetSheetOpen} onCreateOpenChange={setBudgetSheetOpen} />
      )}

      <TabBar tab={tab} onTabChange={setTab} onAdd={() => setAddOpen(true)} />

      <ExpenseSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        accountEmail={accountEmail}
        onOpenCategories={() => {
          setSettingsOpen(false)
          setCategoriesOpen(true)
        }}
      />
      <CategoriesSheet open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </div>
  )
}
