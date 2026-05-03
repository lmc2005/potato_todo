import { useQuery } from '@tanstack/react-query'
import { AnimatedAxis, AnimatedBarSeries, AnimatedGrid, AnimatedLineSeries, Tooltip, XYChart } from '@visx/xychart'
import { useState } from 'react'

import { loadStats } from '@/features/workspace/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input } from '@/shared/components/ui'
import { formatMinutes, getWindowRange } from '@/shared/lib/date'
import { describeError } from '@/shared/lib/errors'

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatAxisDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return value
  }
  return `${monthNames[month - 1]} ${day}`
}

export function RouteComponent() {
  const [range, setRange] = useState(() => getWindowRange(14))
  const analyticsQuery = useQuery({
    queryKey: ['analytics', range.start, range.end],
    queryFn: () => loadStats(range.start, range.end),
  })
  const stats = analyticsQuery.data?.stats
  const dailyTrend = stats?.daily_trend ?? []
  const lineTickStride = dailyTrend.length > 5 ? Math.ceil(dailyTrend.length / 5) : 1
  const lineTickValues = dailyTrend
    .filter((_, index) => index % lineTickStride === 0 || index === dailyTrend.length - 1)
    .map((item) => item.date)
  const leadSubject = stats?.subject_breakdown[0]
  const topFocusDays = [...dailyTrend].sort((left, right) => right.minutes - left.minutes).slice(0, 3)

  return (
    <div className="analytics-page grid gap-8">
      <ScrollReveal>
        <section className="analytics-hero">
          <div className="analytics-hero-copy">
            <p className="eyebrow">Analytics</p>
            <h1 className="analytics-hero-title">
              Read the week
              <br />
              through pace,
              <br />
              <span className="gradient-heading">not pressure.</span>
            </h1>
            <p className="analytics-hero-copy-text">
              Keep the data legible and quiet: total focus, daily movement, and subject balance sit in one editorial surface instead of a noisy dashboard wall.
            </p>

            <div className="analytics-stat-row">
              <div className="analytics-stat-card">
                <p className="eyebrow">Tracked focus</p>
                <p className="analytics-stat-value">{stats ? formatMinutes(stats.total_minutes) : '--'}</p>
                <p className="analytics-stat-copy">{stats ? `${stats.session_count} sessions in range` : 'Record a few sessions to start the readout.'}</p>
              </div>
              <div className="analytics-stat-card">
                <p className="eyebrow">Consistency</p>
                <p className="analytics-stat-value">{stats?.streak_days ?? 0}d</p>
                <p className="analytics-stat-copy">Current streak, measured by consecutive active days.</p>
              </div>
              <div className="analytics-stat-card">
                <p className="eyebrow">Lead lane</p>
                <p className="analytics-stat-value">{leadSubject?.name ?? 'None'}</p>
                <p className="analytics-stat-copy">
                  {leadSubject ? `${Math.round(leadSubject.share * 100)}% of your tracked focus.` : 'A dominant study lane appears once time is logged.'}
                </p>
              </div>
            </div>
          </div>

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

            <div className="analytics-inline-note">
              <p className="eyebrow">Current read</p>
              <p className="analytics-inline-title">{leadSubject?.name ?? 'Waiting for signal'}</p>
              <p className="analytics-inline-copy">
                {leadSubject
                  ? `${formatMinutes(leadSubject.minutes)} logged for the current leading lane.`
                  : 'The top lane will appear here as soon as you begin tracking focus.'}
              </p>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {analyticsQuery.error ? <InlineMessage tone="danger">{describeError(analyticsQuery.error)}</InlineMessage> : null}

      <ScrollReveal delayMs={100}>
        <section className="analytics-layout">
          <article className="analytics-chart-stage">
            <div className="analytics-section-head">
              <div>
                <p className="eyebrow">Daily line</p>
                <h2 className="analytics-section-title">How the minutes moved day by day.</h2>
              </div>
            </div>

            {!stats || dailyTrend.length === 0 ? (
              <EmptyState title="No focus sessions in range" description="Record a few sessions on the Focus page and the line will begin to take shape here." />
            ) : (
              <div className="analytics-chart-frame">
                <div className="h-[340px]">
                  <XYChart
                    height={340}
                    xScale={{ type: 'band' }}
                    yScale={{ type: 'linear' }}
                    margin={{ top: 16, right: 16, bottom: 58, left: 52 }}
                  >
                    <AnimatedGrid columns={false} numTicks={4} lineStyle={{ stroke: 'rgba(20,27,42,0.08)' }} />
                    <AnimatedAxis
                      orientation="bottom"
                      tickFormat={formatAxisDate}
                      tickValues={lineTickValues}
                      tickLabelProps={() => ({
                        fill: 'rgba(92,102,118,0.82)',
                        fontSize: 11,
                        textAnchor: 'middle',
                        dy: 10,
                      })}
                    />
                    <AnimatedAxis orientation="left" tickLabelProps={() => ({ fill: 'rgba(92,102,118,0.82)', fontSize: 11 })} />
                    <AnimatedLineSeries
                      dataKey="Focus Minutes"
                      data={dailyTrend}
                      xAccessor={(datum) => datum.date}
                      yAccessor={(datum) => datum.minutes}
                      stroke="url(#trendGradient)"
                    />
                    <Tooltip
                      renderTooltip={({ tooltipData }) => {
                        const point = tooltipData?.nearestDatum?.datum
                        if (!point || typeof point !== 'object') {
                          return null
                        }
                        return (
                          <div className="rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-sm text-[#1d1d1f] shadow-[0_16px_32px_rgba(0,0,0,0.08)]">
                            <p>{String((point as { date: string }).date)}</p>
                            <p className="mt-1 font-medium text-[#796dff]">{String((point as { minutes: number }).minutes)} minutes</p>
                          </div>
                        )
                      }}
                    />
                    <defs>
                      <linearGradient id="trendGradient" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="#796dff" />
                        <stop offset="100%" stopColor="#0099ff" />
                      </linearGradient>
                    </defs>
                  </XYChart>
                </div>
              </div>
            )}
          </article>

          <aside className="analytics-side-stack">
            <article className="analytics-mix-card">
              <div className="analytics-section-head">
                <div>
                  <p className="eyebrow">Subject mix</p>
                  <h2 className="analytics-section-title">Where the week is leaning.</h2>
                </div>
              </div>

              {!stats || stats.subject_breakdown.length === 0 ? (
                <EmptyState title="No breakdown yet" description="Once you have tracked focus by subject, the distribution will appear here automatically." />
              ) : (
                <div className="grid gap-4">
                  <div className="analytics-mini-chart">
                    <div className="h-[240px]">
                      <XYChart
                        height={240}
                        xScale={{ type: 'band' }}
                        yScale={{ type: 'linear' }}
                        margin={{ top: 16, right: 16, bottom: 44, left: 52 }}
                      >
                        <AnimatedGrid columns={false} numTicks={4} lineStyle={{ stroke: 'rgba(20,27,42,0.08)' }} />
                        <AnimatedAxis orientation="bottom" tickLabelProps={() => ({ fill: 'rgba(92,102,118,0.82)', fontSize: 10.5, textAnchor: 'middle' })} />
                        <AnimatedAxis orientation="left" tickLabelProps={() => ({ fill: 'rgba(92,102,118,0.82)', fontSize: 11 })} />
                        <AnimatedBarSeries
                          dataKey="Subject Minutes"
                          data={stats.subject_breakdown}
                          xAccessor={(datum) => datum.name}
                          yAccessor={(datum) => datum.minutes}
                        />
                      </XYChart>
                    </div>
                  </div>

                  <div className="analytics-note-list">
                    {stats.subject_breakdown.map((item) => (
                      <div key={`${item.subject_id}-${item.name}`} className="analytics-note-row">
                        <div className="flex items-center gap-3">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="font-medium text-[#1d1d1f]">{item.name}</span>
                        </div>
                        <span className="text-sm text-[#6e6e73]">
                          {formatMinutes(item.minutes)} · {Math.round(item.share * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>

            <article className="analytics-insight-card">
              <p className="eyebrow">Top days</p>
              <h2 className="analytics-section-title">The strongest windows in this range.</h2>
              {topFocusDays.length === 0 ? (
                <p className="analytics-inline-copy">No tracked days yet.</p>
              ) : (
                <div className="analytics-note-list">
                  {topFocusDays.map((item) => (
                    <div key={item.date} className="analytics-note-row">
                      <div>
                        <p className="font-medium text-[#1d1d1f]">{formatAxisDate(item.date)}</p>
                        <p className="text-sm text-[#6e6e73]">{item.minutes} minutes</p>
                      </div>
                      <span className="analytics-day-pill">{item.minutes >= 120 ? 'Deep' : 'Light'}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </aside>
        </section>
      </ScrollReveal>
    </div>
  )
}
