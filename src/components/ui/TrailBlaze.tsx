/**
 * Trail-difficulty blazes, as on trailhead signs: the grade of trail the readiness score says you can take today.
 * Bands follow the readiness score's own recommendation thresholds (src/scores/readiness.ts: 80 / 60 / 40).
 */
export type TrailGrade = 'hard' | 'moderate' | 'easy' | 'closed'

export const TRAIL_GRADES: Record<TrailGrade, { name: string; effort: string }> = {
  hard: { name: 'Black diamond', effort: 'Hard trail' },
  moderate: { name: 'Blue square', effort: 'Moderate trail' },
  easy: { name: 'Green circle', effort: 'Easy trail' },
  closed: { name: 'Trail closed', effort: 'Rest day' },
}

export function gradeForReadiness(score: number | null | undefined): TrailGrade | null {
  if (score == null) return null
  if (score >= 80) return 'hard'
  if (score >= 60) return 'moderate'
  if (score >= 40) return 'easy'
  return 'closed'
}

export function TrailBlaze({ grade, size = 56 }: { grade: TrailGrade | null; size?: number }) {
  const label = grade ? TRAIL_GRADES[grade].name : 'No grade yet'
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label={label} className="shrink-0">
      {grade === 'hard' && <rect x="10" y="10" width="36" height="36" transform="rotate(45 28 28)" fill="#151814" stroke="var(--text-primary)" strokeWidth="1.5" />}
      {grade === 'moderate' && <rect x="8" y="8" width="40" height="40" fill="#1f5fa8" />}
      {grade === 'easy' && <circle cx="28" cy="28" r="22" fill="#2f7d4a" />}
      {grade === 'closed' && (
        <>
          <rect x="4" y="14" width="48" height="28" rx="3" fill="#c2412d" />
          <rect x="12" y="25" width="32" height="6" fill="#ffffff" />
        </>
      )}
      {grade === null && <rect x="9" y="9" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />}
    </svg>
  )
}
