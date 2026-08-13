import { useState } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { Timeline } from './screens/Timeline'
import { Budgets } from './screens/Budgets'
import { ExpenseSheet } from './screens/ExpenseSheet'
import { SettingsSheet } from './screens/SettingsSheet'

export default function App() {
  const [tab, setTab] = useState<Tab>('timeline')
  const [addOpen, setAddOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
