import type { StatsPayload } from '@potato/contracts'
import { useQuery } from '@tanstack/react-query'
import { AnimatedAreaSeries, AnimatedAxis, AnimatedBarSeries, AnimatedGrid, AnimatedLineSeries, Tooltip, XYChart } from '@visx/xychart'
import { useState } from 'react'

import { loadStats } from '@/features/workspace/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input } from '@/shared/components/ui'
import { formatDetailedDate, formatMinutes, formatSignedMinutes, getWindowRange } from '@/shared/lib/date'
import { describeError } from '@/shared/lib/errors'

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type DailyPoint = StatsPayload['daily_trend'][number]
type CompletionPoint = StatsPayload['task_completion_trend'][number]
type TaskPoint = StatsPayload['task_ranking'][number]
type SessionPoint = StatsPayload['sessions'][number]

function formatAxisDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return value
  }
  return `${monthNames[month - 1]} ${day}`
}

function formatRate(value: number | null | undefined) {
  if (value == null) {
    return '--'
  }
  return `${Math.round(value * 100)}%`
}

function formatRateDetailed(value: number | null | undefined) {
  if (value == null) {
    return '--'
  }
  return `${(value * 100).toFixed(1)}%`
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function standardDeviation(values: number[]) {
  if (values.length <= 1) {
    return 0
  }
  const mean = average(values)
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function buildRollingAverage(rows: DailyPoint[], windowSize: number) {
  return rows.map((row, index) => {
    const slice = rows.slice(Math.max(0, index - windowSize + 1), index + 1)
    return {
      date: row.date,
      average: Number(average(slice.map((item) => item.minutes)).toFixed(1)),
    }
  })
}

function buildTickValues<T extends { date: string }>(rows: T[], maxTicks = 6) {
  if (rows.length <= maxTicks) {
    return rows.map((row) => row.date)
  }
  const stride = Math.max(1, Math.ceil(rows.length / maxTicks))
  return rows.filter((_, index) => index % stride === 0 || index === rows.length - 1).map((row) => row.date)
}

function truncateLabel(value: string, maxLength = 12) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function concentrationLabel(index: number) {
  if (index >= 0.45) {
    return 'Highly concentrated'
  }
  if (index >= 0.25) {
    return 'Moderately concentrated'
  }
  return 'Balanced spread'
}

function momentumLabel(delta: number) {
  if (delta >= 15) {
    return 'Pace rising'
  }
  if (delta <= -15) {
    return 'Pace cooling'
  }
  return 'Pace steady'
}

function buildSessionBuckets(rows: SessionPoint[]) {
  const buckets = [
    { min: 0, max: 25 },
    { min: 25, max: 50 },
    { min: 50, max: 90 },
    { min: 90, max: 150 },
    { min: 150, max: Number.POSITIVE_INFINITY },
  ]

  return buckets.map((bucket) => {
    const count = rows.filter((row) => {
      const minutes = row.focus_seconds / 60
      return minutes >= bucket.min && minutes < bucket.max
    }).length
    return {
      ...bucket,
      label:
        bucket.max === Number.POSITIVE_INFINITY
          ? `${formatMinutes(bucket.min)}+`
          : `${formatMinutes(bucket.min)}-${formatMinutes(bucket.max)}`,
      count,
    }
  })
}

function buildSubjectPieBackground(rows: StatsPayload['subject_breakdown']) {
  if (rows.length === 0) {
    return 'conic-gradient(rgba(17,19,27,0.08) 0deg 360deg)'
  }

  const totalMinutes = rows.reduce((sum, row) => sum + Math.max(row.minutes, 0), 0)
  if (totalMinutes <= 0) {
    return 'conic-gradient(rgba(17,19,27,0.08) 0deg 360deg)'
  }

  let currentTurn = 0
  const stops = rows.map((row) => {
    const ratio = Math.max(row.minutes, 0) / totalMinutes
    const start = currentTurn * 360
    currentTurn += ratio
    const end = currentTurn * 360
    return `${row.color} ${start}deg ${end}deg`
  })

  if (currentTurn < 1) {
    stops.push(`rgba(17,19,27,0.08) ${currentTurn * 360}deg 360deg`)
  }

  return `conic-gradient(${stops.join(', ')})`
}

function sumCompletion(rows: CompletionPoint[]) {
  return rows.reduce(
    (accumulator, row) => ({
      total: accumulator.total + row.total,
      completed: accumulator.completed + row.completed,
      onTime: accumulator.onTime + row.on_time,
    }),
    { total: 0, completed: 0, onTime: 0 },
  )
}

export function RouteComponent() {
  const [range, setRange] = useState(() => getWindowRange(14))
  const analyticsQuery = useQuery({
    queryKey: ['analytics', range.start, range.end],
    queryFn: () => loadStats(range.start, range.end),
  })

  const stats = analyticsQuery.data?.stats
  const dailyTrend = stats?.daily_trend ?? []
  const movingAverage = buildRollingAverage(dailyTrend, 3)
  const taskCompletionTrend = stats?.task_completion_trend ?? []
  const subjectBreakdown = stats?.subject_breakdown ?? []
  const goalCompletion = stats?.goal_completion ?? []
  const taskRanking = stats?.task_ranking ?? []
  const sessions = stats?.sessions ?? []
  const topFocusDays = [...dailyTrend].sort((left, right) => right.minutes - left.minutes).slice(0, 3)
  const leadSubject = subjectBreakdown[0]
  const completionSummary = sumCompletion(taskCompletionTrend)
  const totalCompletionRate = completionSummary.total > 0 ? completionSummary.completed / completionSummary.total : null
  const totalOnTimeRate = completionSummary.total > 0 ? completionSummary.onTime / completionSummary.total : null
  const dailyMinutes = dailyTrend.map((item) => item.minutes)
  const activeDays = dailyTrend.filter((item) => item.minutes > 0)
  const activeDayRate = dailyTrend.length > 0 ? activeDays.length / dailyTrend.length : 0
  const meanDailyMinutes = average(dailyMinutes)
  const medianDailyMinutes = median(dailyMinutes)
  const volatility = standardDeviation(dailyMinutes)
  const concentrationIndex = subjectBreakdown.reduce((sum, item) => sum + item.share * item.share, 0)
  const averageSessionMinutes = sessions.length > 0 ? average(sessions.map((item) => item.focus_seconds / 60)) : 0
  const medianSessionMinutes = sessions.length > 0 ? median(sessions.map((item) => item.focus_seconds / 60)) : 0
  const goalCompletionAverage = goalCompletion.length > 0 ? average(goalCompletion.map((item) => item.completion)) : 0
  const goalsOnTrack = goalCompletion.filter((item) => item.completion >= 1).length
  const splitPoint = Math.max(1, Math.floor(dailyTrend.length / 2))
  const earlyWindow = dailyTrend.slice(0, splitPoint)
  const lateWindow = dailyTrend.slice(splitPoint)
  const momentumDelta = lateWindow.length > 0 ? average(lateWindow.map((item) => item.minutes)) - average(earlyWindow.map((item) => item.minutes)) : 0
  const sessionBuckets = buildSessionBuckets(sessions)
  const sessionBucketMax = Math.max(...sessionBuckets.map((item) => item.count), 1)
  const trendTickValues = buildTickValues(dailyTrend)
  const completionTickValues = buildTickValues(taskCompletionTrend)
  const recentSessions = [...sessions].sort((left, right) => right.started_at.localeCompare(left.started_at)).slice(0, 5)
  const subjectPieBackground = buildSubjectPieBackground(subjectBreakdown)

  return (
    <div className="analytics-page grid gap-8">
      <ScrollReveal>
        <section className="analytics-hero">
          <div className="analytics-hero-copy">
            <p className="eyebrow">Analytics</p>
            <h1 className="analytics-hero-title">
              See the study week
              <br />
              as rhythm,
              <br />
              <span className="gradient-heading">quality, and balance.</span>
            </h1>
            <p className="analytics-hero-copy-text">
              This report reads focus density, completion quality, lane concentration, and goal attainment together, so the signal feels closer to a real operating review than a decorative dashboard.
            </p>

            <div className="analytics-reading-strip">
              <span className="analytics-reading-pill">{momentumLabel(momentumDelta)}</span>
              <span className="analytics-reading-pill">{concentrationLabel(concentrationIndex)}</span>
              <span className="analytics-reading-pill">{formatRateDetailed(totalOnTimeRate)} on-time execution</span>
            </div>
          </div>

          <div className="analytics-control-column">
            <div className="analytics-filter-card">
              <p className="eyebrow">Window</p>
              <div className="grid gap-3">
                <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                  Start date
                  <Input type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} />
                </label>
                <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                  End date
                  <Input type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} />
                </label>
                <Button variant="secondary" onClick={() => analyticsQuery.refetch()}>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="analytics-inline-note analytics-signal-card">
              <p className="eyebrow">Current signal</p>
              <p className="analytics-inline-title">{leadSubject?.name ?? 'Waiting for tracked focus'}</p>
              <p className="analytics-inline-copy">
                {leadSubject
                  ? `${Math.round(leadSubject.share * 100)}% of the window is currently anchored in ${leadSubject.name}, with ${formatMinutes(leadSubject.minutes)} recorded focus.`
                  : 'Start a few focus sessions and the leading lane, concentration, and execution quality will populate automatically.'}
              </p>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {analyticsQuery.error ? <InlineMessage tone="danger">{describeError(analyticsQuery.error)}</InlineMessage> : null}

      <ScrollReveal delayMs={80}>
        <section className="analytics-kpi-grid">
          <article className="analytics-stat-card analytics-kpi-card">
            <p className="eyebrow">Tracked focus</p>
            <p className="analytics-kpi-value">{stats ? formatMinutes(stats.total_minutes) : '--'}</p>
            <p className="analytics-kpi-copy">{stats ? `${stats.session_count} study sessions logged in this range.` : 'No tracked focus in this window yet.'}</p>
          </article>

          <article className="analytics-stat-card analytics-kpi-card">
            <p className="eyebrow">Daily mean</p>
            <p className="analytics-kpi-value">{formatMinutes(meanDailyMinutes)}</p>
            <p className="analytics-kpi-copy">{formatRateDetailed(activeDayRate)} of days are active, with a median of {formatMinutes(medianDailyMinutes)}.</p>
          </article>

          <article className="analytics-stat-card analytics-kpi-card">
            <p className="eyebrow">Volatility</p>
            <p className="analytics-kpi-value">{formatMinutes(volatility)}</p>
            <p className="analytics-kpi-copy">Standard deviation of daily focus minutes, used here as a stability signal for workload spread.</p>
          </article>

          <article className="analytics-stat-card analytics-kpi-card">
            <p className="eyebrow">Lead lane</p>
            <p className="analytics-kpi-value analytics-kpi-value-subject">{leadSubject?.name ?? 'None yet'}</p>
            <p className="analytics-kpi-copy">
              {leadSubject ? `${formatRateDetailed(leadSubject.share)} share of tracked focus.` : 'A leading subject appears after the first logged sessions.'}
            </p>
          </article>

          <article className="analytics-stat-card analytics-kpi-card">
            <p className="eyebrow">Execution quality</p>
            <p className="analytics-kpi-value">{formatRate(totalOnTimeRate)}</p>
            <p className="analytics-kpi-copy">
              {completionSummary.total > 0
                ? `${formatRateDetailed(totalCompletionRate)} completed, ${completionSummary.onTime}/${completionSummary.total} on time.`
                : 'No due tasks in the selected window yet.'}
            </p>
          </article>
        </section>
      </ScrollReveal>

      <ScrollReveal delayMs={120}>
        <section className="analytics-editorial-grid">
          <article className="analytics-primary-stage">
            <div className="analytics-section-head">
              <div>
                <p className="eyebrow">Focus rhythm</p>
                <h2 className="analytics-section-title">Daily minutes with a rolling mean to show pacing, not noise.</h2>
              </div>
            </div>

            {!stats || dailyTrend.length === 0 ? (
              <EmptyState title="No focus sessions in range" description="Track a few sessions on the Focus page and this rhythm view will start drawing daily volume and rolling pace." />
            ) : (
              <>
                <div className="analytics-chart-frame">
                  <div className="h-[360px]">
                    <XYChart
                      height={360}
                      xScale={{ type: 'point' }}
                      yScale={{ type: 'linear' }}
                      margin={{ top: 14, right: 20, bottom: 58, left: 56 }}
                    >
                      <AnimatedGrid columns={false} numTicks={4} lineStyle={{ stroke: 'rgba(20,27,42,0.08)' }} />
                      <AnimatedAxis
                        orientation="bottom"
                        tickFormat={formatAxisDate}
                        tickValues={trendTickValues}
                        tickLabelProps={() => ({
                          fill: 'rgba(92,102,118,0.86)',
                          fontSize: 11,
                          textAnchor: 'middle',
                          dy: 12,
                        })}
                      />
                      <AnimatedAxis
                        orientation="left"
                        tickFormat={(value) => formatMinutes(Number(value))}
                        tickLabelProps={() => ({ fill: 'rgba(92,102,118,0.86)', fontSize: 11 })}
                      />
                      <AnimatedAreaSeries
                        dataKey="Focus minutes"
                        data={dailyTrend}
                        xAccessor={(datum) => datum.date}
                        yAccessor={(datum) => datum.minutes}
                        fill="url(#analyticsDailyArea)"
                        fillOpacity={0.48}
                        stroke="#796dff"
                      />
                      <AnimatedLineSeries
                        dataKey="3-day mean"
                        data={movingAverage}
                        xAccessor={(datum) => datum.date}
                        yAccessor={(datum) => datum.average}
                        stroke="#141b2a"
                      />
                      <Tooltip
                        renderTooltip={({ tooltipData }) => {
                          const focusPoint = tooltipData?.datumByKey?.['Focus minutes']?.datum as DailyPoint | undefined
                          const averagePoint = tooltipData?.datumByKey?.['3-day mean']?.datum as { date: string; average: number } | undefined
                          if (!focusPoint && !averagePoint) {
                            return null
                          }
                          return (
                            <div className="analytics-tooltip">
                              <p>{formatAxisDate(focusPoint?.date ?? averagePoint?.date ?? '')}</p>
                              <p className="analytics-tooltip-emphasis">{focusPoint ? formatMinutes(focusPoint.minutes) : '--'}</p>
                              <p>{averagePoint ? `3-day mean ${formatMinutes(averagePoint.average)}` : 'Rolling mean unavailable'}</p>
                            </div>
                          )
                        }}
                      />
                      <defs>
                        <linearGradient id="analyticsDailyArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgba(121,109,255,0.42)" />
                          <stop offset="100%" stopColor="rgba(121,109,255,0.04)" />
                        </linearGradient>
                      </defs>
                    </XYChart>
                  </div>
                </div>

                <div className="analytics-reading-grid">
                  <div className="analytics-reading-card">
                    <p className="eyebrow">Average day</p>
                    <p className="analytics-reading-value">{formatMinutes(meanDailyMinutes)}</p>
                    <p className="analytics-kpi-copy">Average daily focus across the selected range.</p>
                  </div>
                  <div className="analytics-reading-card">
                    <p className="eyebrow">Session median</p>
                    <p className="analytics-reading-value">{formatMinutes(medianSessionMinutes)}</p>
                    <p className="analytics-kpi-copy">Typical session size, less distorted by outliers than a mean.</p>
                  </div>
                  <div className="analytics-reading-card">
                    <p className="eyebrow">Momentum shift</p>
                    <p className="analytics-reading-value">{formatSignedMinutes(momentumDelta)}</p>
                    <p className="analytics-kpi-copy">Difference between the later half and earlier half of the current window.</p>
                  </div>
                </div>
              </>
            )}
          </article>

          <aside className="analytics-support-stack">
            <article className="analytics-completion-card">
              <div className="analytics-section-head">
                <div>
                  <p className="eyebrow">Task execution</p>
                  <h2 className="analytics-section-title">Completion rate versus on-time quality.</h2>
                </div>
              </div>

              {taskCompletionTrend.every((item) => item.total === 0) ? (
                <EmptyState title="No dated tasks in range" description="Add due dates to tasks and the quality curve will begin to show completion and timeliness separately." />
              ) : (
                <div className="analytics-chart-frame">
                  <div className="h-[300px]">
                    <XYChart
                      height={300}
                      xScale={{ type: 'point' }}
                      yScale={{ type: 'linear', domain: [0, 1] }}
                      margin={{ top: 14, right: 16, bottom: 58, left: 52 }}
                    >
                      <AnimatedGrid columns={false} numTicks={4} lineStyle={{ stroke: 'rgba(20,27,42,0.08)' }} />
                      <AnimatedAxis
                        orientation="bottom"
                        tickFormat={formatAxisDate}
                        tickValues={completionTickValues}
                        tickLabelProps={() => ({
                          fill: 'rgba(92,102,118,0.86)',
                          fontSize: 11,
                          textAnchor: 'middle',
                          dy: 12,
                        })}
                      />
                      <AnimatedAxis
                        orientation="left"
                        tickFormat={(value) => `${Math.round(Number(value) * 100)}%`}
                        tickLabelProps={() => ({ fill: 'rgba(92,102,118,0.86)', fontSize: 11 })}
                      />
                      <AnimatedLineSeries
                        dataKey="Completion rate"
                        data={taskCompletionTrend}
                        xAccessor={(datum) => datum.date}
                        yAccessor={(datum) => datum.completion_rate ?? 0}
                        stroke="#796dff"
                      />
                      <AnimatedLineSeries
                        dataKey="On-time rate"
                        data={taskCompletionTrend}
                        xAccessor={(datum) => datum.date}
                        yAccessor={(datum) => datum.on_time_rate ?? 0}
                        stroke="#11131b"
                      />
                      <Tooltip
                        renderTooltip={({ tooltipData }) => {
                          const completionPoint = tooltipData?.datumByKey?.['Completion rate']?.datum as CompletionPoint | undefined
                          const onTimePoint = tooltipData?.datumByKey?.['On-time rate']?.datum as CompletionPoint | undefined
                          const row = completionPoint ?? onTimePoint
                          if (!row) {
                            return null
                          }
                          return (
                            <div className="analytics-tooltip">
                              <p>{formatAxisDate(row.date)}</p>
                              <p className="analytics-tooltip-emphasis">{formatRateDetailed(row.completion_rate)} completed</p>
                              <p>{formatRateDetailed(row.on_time_rate)} on time</p>
                              <p>{row.completed}/{row.total} completed, {row.on_time}/{row.total} on time</p>
                            </div>
                          )
                        }}
                      />
                    </XYChart>
                  </div>
                </div>
              )}
            </article>

          </aside>
        </section>
      </ScrollReveal>

      <ScrollReveal delayMs={140}>
        <section className="analytics-subject-stage">
          <div className="analytics-section-head">
            <div>
              <p className="eyebrow">Subject mix</p>
              <h2 className="analytics-section-title">Distribution of focus across active study lanes.</h2>
            </div>
          </div>

          {!stats || subjectBreakdown.length === 0 ? (
            <EmptyState title="No subject breakdown yet" description="Once focus is tracked against subjects, this section will show the week’s distribution with one color per lane." />
          ) : (
            <div className="analytics-pie-layout">
              <div className="analytics-pie-shell">
                <div className="analytics-pie-chart" style={{ background: subjectPieBackground }}>
                  <div className="analytics-pie-core">
                    <p className="eyebrow">Lead lane</p>
                    <p className="analytics-inline-title">{leadSubject?.name ?? 'Waiting for signal'}</p>
                    <p className="analytics-kpi-copy">
                      {leadSubject ? `${formatRateDetailed(leadSubject.share)} of tracked focus` : 'No subject has emerged yet.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="analytics-pie-legend">
                {subjectBreakdown.map((item) => (
                  <div key={`${item.subject_id}-${item.name}`} className="analytics-pie-row">
                    <div className="analytics-progress-head">
                      <div className="flex items-center gap-3">
                        <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: item.color }} />
                        <p className="font-medium text-[#11131b]">{item.name}</p>
                      </div>
                      <span className="text-sm text-[#6e6e73]">{formatMinutes(item.minutes)} · {formatRate(item.share)}</span>
                    </div>
                    <div className="analytics-progress-track">
                      <div className="analytics-progress-fill" style={{ width: `${Math.max(item.share * 100, 4)}%`, background: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </ScrollReveal>

      <ScrollReveal delayMs={160}>
        <section className="analytics-secondary-grid">
          <article className="analytics-goal-card">
            <div className="analytics-section-head">
              <div>
                <p className="eyebrow">Goal attainment</p>
                <h2 className="analytics-section-title">Actual minutes versus target minutes by lane.</h2>
              </div>
            </div>

            {goalCompletion.length === 0 ? (
              <EmptyState title="No goal baselines yet" description="Add daily, weekly, or monthly goals to subjects and this section will evaluate progress against those targets." />
            ) : (
              <>
                <div className="analytics-goal-summary">
                  <div>
                    <p className="analytics-reading-value">{goalsOnTrack}/{goalCompletion.length}</p>
                    <p className="analytics-kpi-copy">subjects on or above target</p>
                  </div>
                  <div>
                    <p className="analytics-reading-value">{formatRate(goalCompletionAverage)}</p>
                    <p className="analytics-kpi-copy">average target attainment</p>
                  </div>
                </div>
                <div className="analytics-progress-list">
                  {goalCompletion.map((item) => (
                    <div key={`${item.subject_id}-${item.name}`} className="analytics-progress-row">
                      <div className="analytics-progress-head">
                        <div>
                          <p className="font-medium text-[#11131b]">{item.name}</p>
                          <p className="text-sm text-[#6e6e73]">
                            {formatMinutes(item.minutes)} of {formatMinutes(item.target_minutes)}
                          </p>
                        </div>
                        <span className="analytics-day-pill">{formatRateDetailed(item.completion)}</span>
                      </div>
                      <div className="analytics-progress-track">
                        <div
                          className="analytics-progress-fill"
                          style={{ width: `${Math.min(item.completion, 1.25) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>

          <article className="analytics-ranking-card">
            <div className="analytics-section-head">
              <div>
                <p className="eyebrow">Task commitment</p>
                <h2 className="analytics-section-title">Which tasks absorbed the most deliberate time.</h2>
              </div>
            </div>

            {taskRanking.length === 0 ? (
              <EmptyState title="No task-linked sessions yet" description="Link focus sessions to tasks and this ranking will show where the week’s effort has actually landed." />
            ) : (
              <div className="grid gap-4">
                <div className="analytics-chart-frame">
                  <div className="h-[280px]">
                    <XYChart
                      height={280}
                      xScale={{ type: 'band' }}
                      yScale={{ type: 'linear' }}
                      margin={{ top: 16, right: 16, bottom: 62, left: 52 }}
                    >
                      <AnimatedGrid columns={false} numTicks={4} lineStyle={{ stroke: 'rgba(20,27,42,0.08)' }} />
                      <AnimatedAxis
                        orientation="bottom"
                        tickFormat={(value) => truncateLabel(String(value), 12)}
                        tickLabelProps={() => ({
                          fill: 'rgba(92,102,118,0.86)',
                          fontSize: 10.5,
                          textAnchor: 'middle',
                          dy: 12,
                        })}
                      />
                      <AnimatedAxis
                        orientation="left"
                        tickFormat={(value) => formatMinutes(Number(value))}
                        tickLabelProps={() => ({ fill: 'rgba(92,102,118,0.86)', fontSize: 11 })}
                      />
                      <AnimatedBarSeries
                        dataKey="Task minutes"
                        data={taskRanking.slice(0, 6)}
                        xAccessor={(datum) => datum.title}
                        yAccessor={(datum) => datum.minutes}
                      />
                      <Tooltip
                        renderTooltip={({ tooltipData }) => {
                          const row = tooltipData?.nearestDatum?.datum as TaskPoint | undefined
                          if (!row) {
                            return null
                          }
                          return (
                            <div className="analytics-tooltip">
                              <p>{row.title}</p>
                              <p className="analytics-tooltip-emphasis">{formatMinutes(row.minutes)}</p>
                            </div>
                          )
                        }}
                      />
                    </XYChart>
                  </div>
                </div>

                <div className="analytics-ranking-list">
                  {taskRanking.slice(0, 5).map((item, index) => (
                    <div key={`${item.task_id}-${item.title}`} className="analytics-note-row">
                      <div className="grid gap-1">
                        <p className="font-medium text-[#11131b]">
                          {index + 1}. {item.title}
                        </p>
                        <p className="text-sm text-[#6e6e73]">{formatMinutes(item.minutes)} committed</p>
                      </div>
                      <span className="analytics-day-pill">{truncateLabel(item.title, 8)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </section>
      </ScrollReveal>

      <ScrollReveal soft>
        <section className="analytics-tertiary-grid">
          <article className="analytics-distribution-card">
            <div className="analytics-section-head">
              <div>
                <p className="eyebrow">Session distribution</p>
                <h2 className="analytics-section-title">How long individual study runs tend to be.</h2>
              </div>
            </div>

            {sessions.length === 0 ? (
              <EmptyState title="No sessions to distribute" description="Once sessions are recorded, this histogram-style view will show whether you tend to work in short bursts or longer blocks." />
            ) : (
              <>
                <div className="analytics-goal-summary">
                  <div>
                    <p className="analytics-reading-value">{formatMinutes(averageSessionMinutes)}</p>
                    <p className="analytics-kpi-copy">average session length</p>
                  </div>
                  <div>
                    <p className="analytics-reading-value">{formatMinutes(medianSessionMinutes)}</p>
                    <p className="analytics-kpi-copy">median session length</p>
                  </div>
                </div>
                <div className="analytics-distribution-list">
                  {sessionBuckets.map((bucket) => (
                    <div key={bucket.label} className="analytics-distribution-row">
                      <div className="analytics-progress-head">
                        <p className="font-medium text-[#11131b]">{bucket.label}</p>
                        <span className="text-sm text-[#6e6e73]">{bucket.count} sessions</span>
                      </div>
                      <div className="analytics-progress-track">
                        <div
                          className="analytics-distribution-fill"
                          style={{ width: `${(bucket.count / sessionBucketMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>

          <article className="analytics-session-card">
            <div className="analytics-section-head">
              <div>
                <p className="eyebrow">Recent session log</p>
                <h2 className="analytics-section-title">Latest recorded runs for spot-checking the story behind the charts.</h2>
              </div>
            </div>

            {recentSessions.length === 0 ? (
              <EmptyState title="No recent sessions yet" description="Once the timer stores sessions, the latest entries will appear here with subject, mode, and stop reason." />
            ) : (
              <div className="analytics-note-list">
                {recentSessions.map((session) => (
                  <div key={session.id} className="analytics-note-row analytics-session-row">
                    <div className="grid gap-1">
                      <p className="font-medium text-[#11131b]">
                        {session.subject} · {session.task ?? 'Open session'}
                      </p>
                      <p className="text-sm text-[#6e6e73]">
                        {formatDetailedDate(session.started_at)} · {formatMinutes(session.focus_seconds / 60)}
                      </p>
                    </div>
                    <div className="analytics-session-meta">
                      <span className="analytics-day-pill">{session.mode.replace('_', ' ')}</span>
                      <span className="text-sm text-[#6e6e73]">{session.stop_reason ?? 'manual stop'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </ScrollReveal>

      {topFocusDays.length > 0 ? (
        <ScrollReveal soft>
          <section className="analytics-top-days">
            <div className="analytics-section-head">
              <div>
                <p className="eyebrow">Top days</p>
                <h2 className="analytics-section-title">The strongest windows in the current range.</h2>
              </div>
            </div>
            <div className="analytics-reading-grid">
              {topFocusDays.map((item) => (
                <div key={item.date} className="analytics-reading-card">
                  <p className="eyebrow">{formatAxisDate(item.date)}</p>
                  <p className="analytics-reading-value">{formatMinutes(item.minutes)}</p>
                  <p className="analytics-kpi-copy">{item.minutes >= 120 ? 'Deep-focus day with sustained volume.' : 'A lighter but still meaningful study pulse.'}</p>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>
      ) : null}
    </div>
  )
}
