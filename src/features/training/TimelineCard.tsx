import { GLASS_SLIDER } from '../../components/charts/chartKit'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ECharts, EChartsOption } from 'echarts'
import { Card } from '../../components/ui/Card'
import { Chart } from '../../components/ui/Chart'
import { InfoButton } from '../../components/ui/InfoButton'
import type { HrSource } from './loadWorkoutAnalysis'
import { latestSample, type WorkoutTimeline } from './workoutTimeline'
import { GAP_COLOR, SEGMENT_COLORS, SEGMENT_LABELS, SELECTED_COLOR, clock, clockShort, bpm } from './timelineUi'
import type { SegmentType } from './workoutTimeline'

const SPEEDS = [10, 30, 60]
const DROP_COLOR = 'rgba(251, 138, 60, 0.38)'
const SUPERSET_COLOR = 'rgba(167, 139, 250, 0.34)'
const CHART_HEIGHT = 340
/** Must match grid[0] below: top 16px, height 56% of the chart. */
const HR_GRID = { top: 16, height: CHART_HEIGHT * 0.56 }
const HANDLE_W = 12
const TICK_MS = 100

function hrText(timeline: WorkoutTimeline, t: number): string {
  const s = latestSample(timeline.hrSeries, t)
  if (!s) return 'no HR data'
  const age = Math.round(s.ageMs / 1000)
  return `${bpm(s.v)}${age >= 2 ? ` (${age}s ago)` : ''}`
}

function explainer(hrSource: HrSource): string {
  const source =
    hrSource === 'activity'
      ? 'the matched Garmin strength activity'
      : hrSource === 'monitoring'
        ? "Garmin's all-day monitoring (no watch activity was recorded, so samples are 1-2 minutes apart)"
        : 'Garmin — but none was found for this window'
  return `Heart rate from ${source}. Each set ends when it was logged; its start is estimated from the rest you reported unless you've corrected it. Grey bands are stretches with no heart-rate samples — nothing is filled in. The lower panel shows load per set (label = reps). Tap a band or bar to inspect a set, then drag its white handles to correct where it starts or ends; pinch or drag the slider to zoom. Replay steps through the real recorded samples.`
}

export function TimelineCard({
  timeline,
  hrSource,
  selectedIndex,
  onSelect,
  onBoundaryDrag,
}: {
  timeline: WorkoutTimeline
  hrSource: HrSource
  selectedIndex: number | null
  onSelect: (i: number | null) => void
  /** Called when a boundary handle of the selected set is dragged on the chart (watch time, ms). */
  onBoundaryDrag?: (setIndex: number, which: 'start' | 'end', ms: number) => void
}) {
  const [replay, setReplay] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(30)
  const [cursor, setCursor] = useState(timeline.windowStart)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      setCursor((c) => {
        const next = c + TICK_MS * speed
        if (next >= timeline.windowEnd) {
          setPlaying(false)
          return timeline.windowEnd
        }
        return next
      })
    }, TICK_MS)
    return () => {
      if (timer.current != null) window.clearInterval(timer.current)
    }
  }, [playing, speed, timeline.windowEnd])

  // Static parts (data, bands) rebuild only when the timeline or selection changes — not every replay tick.
  const base = useMemo(() => {
    const line: (number | null)[][] = []
    const gapStarts = new Set(timeline.gapRanges.map((g) => g.startMs))
    for (const p of timeline.hrSeries) {
      line.push([p.t, p.v])
      if (gapStarts.has(p.t)) line.push([p.t + 1, null])
    }
    type Area = [{ name: string; xAxis: number; itemStyle: { color: string } }, { xAxis: number }]
    const areas: Area[] = timeline.segments.map((seg, i): Area => {
      const isSelected = seg.type === 'set' && seg.setIndex === selectedIndex
      const setType = seg.setIndex != null && seg.type === 'set' ? timeline.sets[seg.setIndex].set.setType : undefined
      const color = isSelected ? SELECTED_COLOR : setType === 'drop' ? DROP_COLOR : setType === 'superset' ? SUPERSET_COLOR : SEGMENT_COLORS[seg.type]
      return [{ name: `seg-${i}`, xAxis: seg.startMs, itemStyle: { color } }, { xAxis: seg.endMs }]
    })
    for (const g of timeline.gapRanges) areas.push([{ name: 'gap', xAxis: g.startMs, itemStyle: { color: GAP_COLOR } }, { xAxis: g.endMs }])
    const bars = timeline.sets.map((s, i) => ({
      value: [(s.startMs + s.endMs) / 2, s.set.weight ?? 0],
      setIndex: i,
      label: { show: true, position: 'top', formatter: `${s.set.reps}`, fontSize: 9, color: 'var(--text-tertiary)' },
      itemStyle: { color: i === selectedIndex ? '#fb4a59' : s.set.isWarmup ? 'rgba(245,166,35,0.6)' : 'rgba(167,139,250,0.75)' },
    }))
    // One bracket per superset group on the load panel.
    const groups = new Map<number, { start: number; end: number }>()
    for (const st of timeline.sets) {
      if (st.supersetGroup == null) continue
      const g = groups.get(st.supersetGroup)
      groups.set(st.supersetGroup, { start: Math.min(g?.start ?? Infinity, st.startMs), end: Math.max(g?.end ?? -Infinity, st.endMs) })
    }
    const supersetAreas = [...groups.values()].map((g) => [
      { xAxis: g.start, itemStyle: { color: 'rgba(167,139,250,0.12)', borderColor: 'rgba(167,139,250,0.6)', borderWidth: 1 }, label: { show: true, position: 'insideTop', formatter: 'Superset', fontSize: 9, color: '#a78bfa' } },
      { xAxis: g.end },
    ])
    const hasDrop = timeline.sets.some((st) => st.set.setType === 'drop')
    return { line, areas, bars, supersetAreas, hasDrop, hasSuperset: groups.size > 0 }
  }, [timeline, selectedIndex])

  // Draggable boundary handles for the selected set, positioned in pixels from the live chart.
  const [chart, setChart] = useState<ECharts | null>(null)
  const [handles, setHandles] = useState<{ start: number; end: number } | null>(null)
  const sel = selectedIndex != null && !replay && onBoundaryDrag ? timeline.sets[selectedIndex] : null
  const selStart = sel?.startMs
  const selEnd = sel?.endMs
  const dragging = useRef(false)
  const place = useCallback(() => {
    if (dragging.current) return
    if (!chart || selStart == null || selEnd == null) return setHandles(null)
    const a = chart.convertToPixel({ xAxisIndex: 0 }, selStart) as number
    const b = chart.convertToPixel({ xAxisIndex: 0 }, selEnd) as number
    setHandles((p) => (p && Math.abs(p.start - a) < 0.5 && Math.abs(p.end - b) < 0.5 ? p : { start: a, end: b }))
  }, [chart, selStart, selEnd])
  useEffect(() => {
    if (!chart) return
    const frame = requestAnimationFrame(place)
    chart.on('datazoom', place)
    chart.on('finished', place)
    return () => {
      cancelAnimationFrame(frame)
      chart.off('datazoom', place)
      chart.off('finished', place)
    }
  }, [chart, place])

  const segmentAt = useCallback((t: number) => timeline.segments.find((s) => t >= s.startMs && t < s.endMs) ?? null, [timeline])
  const describe = useCallback((t: number) => {
    const seg = segmentAt(t)
    if (!seg) return ''
    if (seg.type === 'set' && seg.setIndex != null) {
      const s = timeline.sets[seg.setIndex]
      return `${s.set.exercise} · set ${s.setNumberInExercise}`
    }
    return SEGMENT_LABELS[seg.type]
  }, [segmentAt, timeline])

  const option = useMemo((): EChartsOption => {
    const span = timeline.windowEnd - timeline.windowStart
    let zoom = { start: 0, end: 100 }
    if (replay) {
      zoom = {
        start: Math.max(0, ((cursor - 180_000 - timeline.windowStart) / span) * 100),
        end: Math.min(100, ((cursor + 60_000 - timeline.windowStart) / span) * 100),
      }
    } else if (selectedIndex != null) {
      const sel = timeline.sets[selectedIndex]
      const pad = Math.max(60_000, (sel.endMs - sel.startMs) * 2)
      zoom = {
        start: Math.max(0, ((sel.startMs - pad - timeline.windowStart) / span) * 100),
        end: Math.min(100, ((sel.endMs + pad - timeline.windowStart) / span) * 100),
      }
    }
    const xBase = { type: 'time' as const, min: timeline.windowStart, max: timeline.windowEnd, splitNumber: 3, axisLine: { lineStyle: { color: 'var(--border-panel)' } } }
    return {
      grid: [
        { left: 8, right: 12, top: 16, height: '56%', containLabel: true },
        { left: 8, right: 12, top: '70%', height: '14%', containLabel: true },
      ],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      tooltip: {
        trigger: 'axis',
        formatter: (raw: unknown) => {
          const ps = raw as { seriesIndex: number; value: [number, number | null] }[]
          const t = ps[0]?.value[0]
          if (t == null) return ''
          return `${clock(t)}<br/><b>${hrText(timeline, t)}</b><br/>${describe(t)}`
        },
      },
      dataZoom: [
        // While a set's handles are shown, dragging on the chart must move a handle, not pan the view.
        { type: 'inside', xAxisIndex: [0, 1], start: zoom.start, end: zoom.end, minValueSpan: 30_000, moveOnMouseMove: !handles },
        { ...GLASS_SLIDER, xAxisIndex: [0, 1], start: zoom.start, end: zoom.end, bottom: 4, left: 44, right: 12 },
      ],
      xAxis: [
        { ...xBase, gridIndex: 0, axisLabel: { show: false } },
        { ...xBase, gridIndex: 1, axisLabel: { color: 'var(--text-tertiary)', hideOverlap: true, formatter: (v: number) => clockShort(v) } },
      ],
      yAxis: [
        { type: 'value', gridIndex: 0, scale: true, name: 'bpm', nameTextStyle: { color: 'var(--text-tertiary)' }, splitLine: { lineStyle: { color: 'var(--border-panel)' } }, axisLabel: { color: 'var(--text-tertiary)' } },
        { type: 'value', gridIndex: 1, name: 'kg', splitNumber: 1, nameTextStyle: { color: 'var(--text-tertiary)' }, splitLine: { show: false }, axisLabel: { color: 'var(--text-tertiary)', fontSize: 9 } },
      ],
      series: [
        {
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: base.line,
          connectNulls: false,
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { color: '#fb4a59', width: 1.5 },
          markArea: { silent: false, label: { show: false }, data: base.areas },
          markLine: replay
            ? { symbol: 'none', silent: true, animation: false, label: { show: false }, lineStyle: { color: '#f4f5f7', width: 1.5, type: 'solid' }, data: [{ xAxis: cursor }] }
            : undefined,
        },
        { type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: base.bars, barWidth: 4, markArea: base.supersetAreas.length ? { silent: true, data: base.supersetAreas as never } : undefined },
      ],
      graphic:
        handles && sel && onBoundaryDrag && chart
          ? (['start', 'end'] as const).map((which) => ({
              type: 'rect' as const,
              id: `handle-${which}`,
              x: handles[which] - HANDLE_W / 2,
              y: HR_GRID.top,
              shape: { width: HANDLE_W, height: HR_GRID.height, r: 4 },
              style: { fill: 'rgba(244,245,247,0.22)', stroke: '#f4f5f7', lineWidth: 1.5 },
              draggable: 'horizontal' as const,
              cursor: 'ew-resize',
              z: 100,
              ondragstart: () => {
                dragging.current = true
              },
              ondragend: (e: { target: { x: number } }) => {
                dragging.current = false
                const ms = chart.convertFromPixel({ xAxisIndex: 0 }, e.target.x + HANDLE_W / 2) as number
                onBoundaryDrag(selectedIndex!, which, Math.round(ms / 1000) * 1000)
              },
            }))
          : [],
    } as EChartsOption
  }, [timeline, base, replay, cursor, selectedIndex, describe, handles, sel, onBoundaryDrag, chart])

  const cursorSeg = replay ? segmentAt(cursor) : null

  const exercises = useMemo(() => {
    const seen = new Map<string, number>()
    timeline.sets.forEach((s) => {
      if (!seen.has(s.set.exercise)) seen.set(s.set.exercise, s.startMs)
    })
    return [...seen.entries()]
  }, [timeline])

  return (
    <Card>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="font-semibold">Workout timeline</p>
        <InfoButton title="How this timeline is built">{explainer(hrSource)}</InfoButton>
        {hrSource === 'monitoring' && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-400">coarse HR</span>}
        <span className="flex-1" />
        <button
          type="button"
          className={`rounded-full px-2.5 py-1 text-xs ${replay ? 'bg-sky-500/20 text-sky-400' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
          onClick={() => {
            setReplay((r) => !r)
            setPlaying(false)
            if (!replay) setCursor(timeline.windowStart)
          }}
        >
          {replay ? 'Exit replay' : '▶ Replay'}
        </button>
      </div>

      {replay && (
        <div className="mb-2 rounded-2xl bg-[var(--bg-panel)] p-3 text-xs">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              {cursorSeg
                ? cursorSeg.type === 'set' && cursorSeg.setIndex != null
                  ? `${timeline.sets[cursorSeg.setIndex].set.exercise} · set ${timeline.sets[cursorSeg.setIndex].setNumberInExercise}`
                  : SEGMENT_LABELS[cursorSeg.type as SegmentType]
                : '—'}
              {cursorSeg?.type === 'set' && cursorSeg.setIndex != null && timeline.sets[cursorSeg.setIndex].startSource !== 'corrected' && (
                <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">(start estimated)</span>
              )}
            </p>
            <p className="tabular-nums">
              {clock(cursor)} · <b>{hrText(timeline, cursor)}</b>
            </p>
          </div>
          <input
            type="range"
            aria-label="Replay position"
            min={timeline.windowStart}
            max={timeline.windowEnd}
            step={1000}
            value={cursor}
            onChange={(e) => setCursor(Number(e.target.value))}
            className="mt-2 w-full accent-sky-400"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!playing && cursor >= timeline.windowEnd) setCursor(timeline.windowStart)
                setPlaying((p) => !p)
              }}
              className="rounded-lg border border-[var(--border-panel)] px-3 py-1"
            >
              {playing ? 'Pause' : cursor >= timeline.windowEnd ? 'Restart' : 'Play'}
            </button>
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded-lg px-2 py-1 ${speed === s ? 'bg-sky-500/20 text-sky-400' : 'text-[var(--text-tertiary)]'}`}>
                {s}×
              </button>
            ))}
            <select
              aria-label="Jump to exercise"
              value=""
              onChange={(e) => {
                setCursor(Number(e.target.value))
                setPlaying(false)
              }}
              className="ml-auto rounded-lg border border-[var(--border-panel)] bg-[var(--bg-panel)] px-2 py-1"
            >
              <option value="">Jump to…</option>
              {exercises.map(([ex, t]) => (
                <option key={ex} value={t}>
                  {ex}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <Chart
        option={option}
        height={CHART_HEIGHT}
        onReady={setChart}
        onClick={(params) => {
          if (params.componentType === 'markArea' && params.name?.startsWith('seg-')) {
            const seg = timeline.segments[Number(params.name.slice(4))]
            if (seg?.setIndex != null) onSelect(seg.setIndex)
            return
          }
          const d = params.data as { setIndex?: number } | undefined
          if (d?.setIndex != null) onSelect(d.setIndex)
        }}
      />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--text-tertiary)]">
        {(Object.keys(SEGMENT_LABELS) as SegmentType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SEGMENT_COLORS[t] }} />
            {SEGMENT_LABELS[t]}
          </span>
        ))}
        {base.hasDrop && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: DROP_COLOR }} />
            Drop set
          </span>
        )}
        {base.hasSuperset && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SUPERSET_COLOR }} />
            Superset
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: GAP_COLOR }} />
          No HR data
        </span>
      </div>
    </Card>
  )
}
