import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { useData } from './app/DataProvider'
import { AppShell } from './app/AppShell'
import { OnboardingFlow } from './features/onboarding/OnboardingFlow'
import { Skeleton } from './components/ui/Skeleton'
import { useApplyAppearance } from './app/appearance'

const TodayPage = lazy(() => import('./features/today/TodayPage').then((m) => ({ default: m.TodayPage })))
const MorePage = lazy(() => import('./features/more/MorePage').then((m) => ({ default: m.MorePage })))
const WorkoutHistoryPage = lazy(() => import('./features/history/WorkoutHistoryPage').then((m) => ({ default: m.WorkoutHistoryPage })))
const BandWorkoutPage = lazy(() => import('./features/history/BandWorkoutPage').then((m) => ({ default: m.BandWorkoutPage })))
const HealthPage = lazy(() => import('./features/health/HealthPage').then((m) => ({ default: m.HealthPage })))
const SleepPage = lazy(() => import('./features/sleep/SleepPage').then((m) => ({ default: m.SleepPage })))
const TrainingFeedPage = lazy(() =>
  import('./features/training/TrainingFeedPage').then((m) => ({ default: m.TrainingFeedPage })),
)
const ActivityDetailPage = lazy(() =>
  import('./features/training/ActivityDetailPage').then((m) => ({ default: m.ActivityDetailPage })),
)
const StrengthPage = lazy(() => import('./features/training/StrengthPage').then((m) => ({ default: m.StrengthPage })))
const WorkoutTimelinePage = lazy(() =>
  import('./features/training/WorkoutTimelinePage').then((m) => ({ default: m.WorkoutTimelinePage })),
)
const ImportReviewPage = lazy(() => import('./features/training/ImportReviewPage').then((m) => ({ default: m.ImportReviewPage })))
const CompareWorkoutsPage = lazy(() =>
  import('./features/training/CompareWorkoutsPage').then((m) => ({ default: m.CompareWorkoutsPage })),
)
const CustomizePage = lazy(() => import('./features/customize/CustomizePage').then((m) => ({ default: m.CustomizePage })))
const InsightsPage = lazy(() => import('./features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))

function RouteFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export default function App() {
  const { status } = useData()
  useApplyAppearance()

  if (status === 'restoring') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-9 w-9 animate-pulse rounded-control bg-[var(--accent)]" />
      </div>
    )
  }

  if (status === 'empty') {
    return <OnboardingFlow />
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<TodayPage />} />
          <Route path="health" element={<HealthPage />} />
          <Route path="training" element={<TrainingFeedPage />} />
          <Route path="training/history" element={<WorkoutHistoryPage />} />
          <Route path="training/history/:key" element={<BandWorkoutPage />} />
          <Route path="training/strength" element={<StrengthPage />} />
          <Route path="training/strength/workout/:workoutId" element={<WorkoutTimelinePage />} />
          <Route path="training/strength/compare/:a/:b" element={<CompareWorkoutsPage />} />
          <Route path="training/strength/workout/:workoutId/review" element={<ImportReviewPage />} />
          <Route path="training/:activityId" element={<ActivityDetailPage />} />
          <Route path="sleep" element={<SleepPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="customize" element={<CustomizePage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
