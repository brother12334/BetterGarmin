import { Route, Routes } from 'react-router-dom'
import { useData } from './app/DataProvider'
import { AppShell } from './app/AppShell'
import { OnboardingFlow } from './features/onboarding/OnboardingFlow'
import { TodayPage } from './features/today/TodayPage'
import { MorePage } from './features/more/MorePage'
import { ComingSoon } from './components/ComingSoon'

export default function App() {
  const { status } = useData()

  if (status === 'restoring') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-9 w-9 animate-pulse rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500" />
      </div>
    )
  }

  if (status === 'empty') {
    return <OnboardingFlow />
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route
          path="health"
          element={<ComingSoon title="Health" blurb="Resting heart rate, all-day HR, stress timelines, weight, and baseline ranges are coming in the next update." />}
        />
        <Route
          path="training"
          element={<ComingSoon title="Training" blurb="Your activity feed, route maps, splits, heart-rate zones, and training load are coming in a later update." />}
        />
        <Route
          path="sleep"
          element={<ComingSoon title="Sleep" blurb="Nightly hypnograms, sleep score breakdowns, and sleep debt tracking are coming in the next update." />}
        />
        <Route
          path="insights"
          element={<ComingSoon title="Insights" blurb="Long-term trends, the correlation explorer, and shareable recap cards are coming in a later update." />}
        />
        <Route path="more" element={<MorePage />} />
      </Route>
    </Routes>
  )
}
