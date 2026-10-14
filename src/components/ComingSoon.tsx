import { Card } from './ui/Card'

export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="font-semibold text-[var(--text-primary)]">Coming in a later update</p>
        <p className="max-w-sm text-sm text-[var(--text-secondary)]">{blurb}</p>
      </Card>
    </div>
  )
}
