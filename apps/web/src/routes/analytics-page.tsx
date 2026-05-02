import { useQuery } from '@tanstack/react-query'
import { AnimatedAxis, AnimatedBarSeries, AnimatedGrid, AnimatedLineSeries, Tooltip, XYChart } from '@visx/xychart'
import { useState } from 'react'

import { loadStats } from '@/features/workspace/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, PageHeader, Panel, SectionHeading } from '@/shared/components/ui'
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
  const lineTickStride = dailyTrend.length > 8 ? Math.ceil(dailyTrend.length / 6) : 1
  const lineTickValues = dailyTrend
    .filter((_, index) => index % lineTickStride === 0 || index === dailyTrend.length - 1)
    .map((item) => item.date)

  return (
    <div className="grid gap-8">
      <ScrollReveal>
        <PageHeader
          eyebrow="Analytics"
          title={
            <>
              <span className="block">Read the week,</span>
              <span className="block gradient-heading">without chasing numbers.</span>
            </>
          }
          description="Daily trend, subject mix, and logged minutes appear only when you need them, keeping the rest of the desk quieter."
          actions={
            <div className="flex flex-wrap gap-3">
              <Input type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} />
              <Input type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} />
              <Button variant="secondary" onClick={() => analyticsQuery.refetch()}>
                Refresh
              </Button>
            </div>
          }
        />
      </ScrollReveal>

      {analyticsQuery.error ? <InlineMessage tone="danger">{describeError(analyticsQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
      <section className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <div className="dark-panel lift-card grid gap-5 p-6 sm:p-7">
          <p className="eyebrow text-white/56">Selected window</p>
          <div className="space-y-3">
            <p className="display-serif text-[clamp(2.6rem,4.4vw,4rem)] leading-[1.04] tracking-[-0.05em] text-white">
              {stats ? formatMinutes(stats.total_minutes) : '--'}
            </p>
            <p className="text-sm leading-7 text-white/70">
              {stats ? `${stats.session_count} logged sessions across ${stats.daily_trend.length} days.` : 'Record a few focus sessions to start building the signal.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Window</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{stats?.daily_trend.length ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Sessions</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{stats?.session_count ?? '--'}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Subjects</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{stats?.subject_breakdown.length ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="surface-panel-strong lift-card grid gap-5 p-6 sm:p-7">
          <p className="eyebrow">Clean signals</p>
          <div className="space-y-3">
            <h2 className="accent-stack-title text-[#1d1d1f]">
              Time trends,
              <br />
              <span className="gradient-heading">without the clutter.</span>
            </h2>
            <p className="text-sm leading-7 text-[#6e6e73]">
              Keep the view focused on movement: how much time landed, where it landed, and whether the week is staying balanced.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-subtle p-4">
              <p className="eyebrow">Date range</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[#1d1d1f]">{range.start}</p>
              <p className="text-sm text-[#6e6e73]">to {range.end}</p>
            </div>
            <div className="surface-subtle p-4">
              <p className="eyebrow">Current read</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[#1d1d1f]">{stats?.subject_breakdown[0]?.name ?? 'No lead subject yet'}</p>
              <p className="mt-2 text-sm leading-7 text-[#6e6e73]">{stats?.subject_breakdown[0] ? `${Math.round(stats.subject_breakdown[0].share * 100)}% of tracked focus` : 'Your strongest lane will appear here once sessions are logged.'}</p>
            </div>
          </div>
        </div>
      </section>
      </ScrollReveal>

      <ScrollReveal delayMs={100}>
      <section className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
        <Panel className="space-y-5">
          <SectionHeading title="Daily line" description="A clearer read on how your time has moved across the selected days." />

          {!stats || dailyTrend.length === 0 ? (
            <EmptyState title="No focus sessions in range" description="Record a few sessions on the Focus page and the line will begin to take shape here." />
          ) : (
            <div className="surface-panel-strong p-4 sm:p-5">
              <div className="h-[340px]">
                <XYChart
                  height={340}
                  xScale={{ type: 'band' }}
                  yScale={{ type: 'linear' }}
                  margin={{ top: 16, right: 16, bottom: 72, left: 52 }}
                >
                  <AnimatedGrid columns={false} numTicks={4} lineStyle={{ stroke: 'rgba(20,27,42,0.08)' }} />
                  <AnimatedAxis
                    orientation="bottom"
                    tickFormat={formatAxisDate}
                    tickValues={lineTickValues}
                    tickLabelProps={() => ({
                      fill: 'rgba(92,102,118,0.82)',
                      fontSize: 10.5,
                      textAnchor: 'end',
                      angle: -32,
                      dx: -10,
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
        </Panel>

        <Panel className="space-y-5">
          <SectionHeading title="Subject mix" description="Which study lanes held the most time and how the week was distributed between them." />

          {!stats || stats.subject_breakdown.length === 0 ? (
            <EmptyState title="No breakdown yet" description="Once you have tracked focus by subject, the distribution will appear here automatically." />
          ) : (
            <div className="grid gap-4">
              <div className="surface-panel-strong p-4">
                <div className="h-[260px]">
                  <XYChart
                    height={260}
                    xScale={{ type: 'band' }}
                    yScale={{ type: 'linear' }}
                    margin={{ top: 16, right: 16, bottom: 48, left: 52 }}
                  >
                    <AnimatedGrid columns={false} numTicks={4} lineStyle={{ stroke: 'rgba(20,27,42,0.08)' }} />
                    <AnimatedAxis orientation="bottom" tickLabelProps={() => ({ fill: 'rgba(92,102,118,0.82)', fontSize: 11, textAnchor: 'middle' })} />
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

              <div className="grid gap-3">
                {stats.subject_breakdown.map((item) => (
                  <div key={`${item.subject_id}-${item.name}`} className="surface-subtle p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="font-medium text-[#1d1d1f]">{item.name}</span>
                      </div>
                      <span className="text-sm text-[#6e6e73]">
                        {formatMinutes(item.minutes)} · {Math.round(item.share * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </section>
      </ScrollReveal>
    </div>
  )
}
