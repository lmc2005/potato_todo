import type { TimerPayload } from '@potato/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { loadCurrentTimer, loadPomodoroSettings, pauseTimer, resumeTimer, skipPomodoro, startPomodoro, startTimer, stopTimer } from '@/features/focus/api'
import { listSubjects, listTasks } from '@/features/workspace/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, MetricCard, PageHeader, Panel, SectionHeading, Select } from '@/shared/components/ui'
import { formatDuration, formatMinutes } from '@/shared/lib/date'
import { describeError } from '@/shared/lib/errors'

function deriveTimerState(timer: TimerPayload | undefined, syncedAtMs: number, anchorMs: number) {
  if (!timer?.active) {
    return {
      active: false,
      elapsedSeconds: 0,
      remainingSeconds: null as number | null,
      displaySeconds: 0,
    }
  }

  const driftSeconds = timer.is_paused ? 0 : Math.max(0, Math.floor((anchorMs - syncedAtMs) / 1000))
  const computedElapsed = (timer.elapsed_seconds ?? 0) + driftSeconds
  const remainingSeconds =
    timer.remaining_seconds == null
      ? null
      : Math.max((timer.remaining_seconds ?? 0) - driftSeconds, 0)

  return {
    active: true,
    elapsedSeconds: computedElapsed,
    remainingSeconds,
    displaySeconds: remainingSeconds ?? computedElapsed,
  }
}

function timerStatusLabel(timer: TimerPayload | undefined) {
  if (!timer?.active) {
    return 'Idle'
  }
  if (timer.mode === 'pomodoro') {
    return `${timer.pomodoro_phase === 'break' ? 'Break' : 'Focus'} round ${timer.pomodoro_round}/${timer.pomodoro_total_rounds}`
  }
  if (timer.mode === 'count_down') {
    return 'Countdown session'
  }
  return 'Count up session'
}

export function RouteComponent() {
  const client = useQueryClient()
  const [mode, setMode] = useState<'count_up' | 'count_down' | 'pomodoro'>('count_up')
  const [subjectId, setSubjectId] = useState<string>('')
  const [taskId, setTaskId] = useState<string>('')
  const [durationMinutes, setDurationMinutes] = useState('50')
  const [pomodoroDraft, setPomodoroDraft] = useState<{
    focusMinutes: string
    shortBreakMinutes: string
    longBreakMinutes: string
    totalRounds: string
  } | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [tickMs, setTickMs] = useState(() => Date.now())
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible')
  const zeroSyncRequestedRef = useRef(false)

  const subjectsQuery = useQuery({
    queryKey: ['subjects'],
    queryFn: () => listSubjects(false),
  })
  const tasksQuery = useQuery({
    queryKey: ['focus-tasks'],
    queryFn: () => listTasks(),
  })
  const pomodoroSettingsQuery = useQuery({
    queryKey: ['pomodoro-settings'],
    queryFn: loadPomodoroSettings,
  })
  const currentTimerQuery = useQuery({
    queryKey: ['current-timer'],
    queryFn: loadCurrentTimer,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible'
      setIsVisible(visible)
      if (visible) {
        setTickMs(Date.now())
        void currentTimerQuery.refetch()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [currentTimerQuery])

  useEffect(() => {
    const timer = currentTimerQuery.data?.result
    if (!timer?.active || timer.is_paused || !isVisible) {
      return
    }
    const intervalId = window.setInterval(() => {
      setTickMs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [currentTimerQuery.data?.result, isVisible])

  useEffect(() => {
    const timer = currentTimerQuery.data?.result
    if (!timer?.active || !isVisible) {
      return
    }
    const intervalId = window.setInterval(() => {
      void currentTimerQuery.refetch()
    }, 15_000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [currentTimerQuery, currentTimerQuery.data?.result, isVisible])

  const syncTimer = (nextTimer: TimerPayload) => {
    client.setQueryData(['current-timer'], {
      result: nextTimer,
    })
    setTickMs(Date.now())
  }

  const startTimerMutation = useMutation({
    mutationFn: startTimer,
    onSuccess: ({ result }) => {
      syncTimer(result)
      setFeedback('Session started.')
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const startPomodoroMutation = useMutation({
    mutationFn: startPomodoro,
    onSuccess: ({ result }) => {
      syncTimer(result)
      setFeedback('Pomodoro started.')
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const pauseTimerMutation = useMutation({
    mutationFn: pauseTimer,
    onSuccess: ({ result }) => {
      syncTimer(result)
      setFeedback('Timer paused.')
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const resumeTimerMutation = useMutation({
    mutationFn: resumeTimer,
    onSuccess: ({ result }) => {
      syncTimer(result)
      setFeedback('Timer resumed.')
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const stopTimerMutation = useMutation({
    mutationFn: stopTimer,
    onSuccess: async ({ result }) => {
      syncTimer(result)
      setFeedback(result.focus_seconds ? `Session stored with ${formatMinutes(Math.round(result.focus_seconds / 60))}.` : 'Timer stopped.')
      await client.invalidateQueries({ queryKey: ['workspace-overview'] })
      await client.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const skipPomodoroMutation = useMutation({
    mutationFn: skipPomodoro,
    onSuccess: ({ result }) => {
      syncTimer(result)
      setFeedback('Pomodoro phase advanced.')
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const timer = currentTimerQuery.data?.result
  const syncedAtMs = currentTimerQuery.dataUpdatedAt || tickMs
  const derived = deriveTimerState(timer, syncedAtMs, tickMs)
  const subjects = subjectsQuery.data?.items ?? []
  const tasks = (tasksQuery.data?.items ?? []).filter((task) => task.status !== 'done')
  const activeSubject = subjects.find((subject) => subject.id === timer?.subject_id)
  const activeTask = tasks.find((task) => task.id === timer?.task_id)
  const pomodoroSettings = pomodoroSettingsQuery.data?.settings
  const focusMinutes = pomodoroDraft?.focusMinutes ?? String(pomodoroSettings?.focus_minutes ?? 25)
  const shortBreakMinutes = pomodoroDraft?.shortBreakMinutes ?? String(pomodoroSettings?.short_break_minutes ?? 5)
  const longBreakMinutes = pomodoroDraft?.longBreakMinutes ?? String(pomodoroSettings?.long_break_minutes ?? 15)
  const totalRounds = pomodoroDraft?.totalRounds ?? String(pomodoroSettings?.total_rounds ?? 4)

  useEffect(() => {
    if (!timer?.active || timer.is_paused || derived.remainingSeconds === null || derived.remainingSeconds > 0 || zeroSyncRequestedRef.current) {
      return
    }
    zeroSyncRequestedRef.current = true
    void currentTimerQuery.refetch().finally(() => {
      zeroSyncRequestedRef.current = false
    })
  }, [currentTimerQuery, derived.remainingSeconds, timer])

  return (
    <div className="grid gap-8">
      <ScrollReveal>
        <PageHeader
          eyebrow="Focus"
          title={
            <>
              <span className="block">Stay with one thing,</span>
              <span className="block gradient-heading">until it is done.</span>
            </>
          }
          description="A calm timer stage for deep work, long reading, and repeatable pomodoro rhythm without visual noise."
        />
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {currentTimerQuery.error ? <InlineMessage tone="danger">{describeError(currentTimerQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Session" value={timer?.active ? timerStatusLabel(timer) : 'Ready'} hint={timer?.active ? 'The active timer is now leading the page.' : 'Pick a subject and begin when you are ready.'} />
        <MetricCard label="Subject" value={activeSubject?.name ?? 'Not set'} hint={activeTask ? `Linked task: ${activeTask.title}` : 'You can connect a task or leave the session open.'} />
        <MetricCard label="Page state" value={isVisible ? 'On screen' : 'Quiet mode'} hint={isVisible ? 'The clock is actively visible right now.' : 'Background tabs stay calmer while you are away.'} />
      </section>
      </ScrollReveal>

      <ScrollReveal delayMs={80}>
      <section className="grid gap-4 xl:grid-cols-[1.14fr_0.86fr]">
        <Panel className="space-y-5">
          <SectionHeading title="Timer stage" description="A large reading surface for the current session, subject context, and pause or stop actions." />

          <div className="dark-panel overflow-hidden p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
              <div className="space-y-4">
                <p className="eyebrow text-white/58">Current session</p>
                <p className="text-[clamp(3.4rem,9vw,7rem)] font-medium tracking-[-0.1em] text-white">
                  {formatDuration(derived.displaySeconds)}
                </p>
                <p className="text-base text-white/74">
                  {timer?.remaining_seconds != null
                    ? `${formatDuration(derived.remainingSeconds ?? 0)} remaining`
                    : `${formatDuration(derived.elapsedSeconds)} elapsed`}
                </p>
              </div>

              <div className="grid gap-3">
                <div className="rounded-[24px] bg-white/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Subject</p>
                  <p className="mt-3 text-lg font-medium tracking-[-0.04em] text-white">{activeSubject?.name ?? 'Choose before starting'}</p>
                </div>
                <div className="rounded-[24px] bg-white/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Task</p>
                  <p className="mt-3 text-sm leading-6 text-white/74">{activeTask?.title ?? 'No linked task yet'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {!timer?.active ? (
              <Button
                onClick={() => {
                  setFeedback(null)
                  if (!subjectId) {
                    setFeedback('Select a subject before starting.')
                    return
                  }
                  if (mode === 'pomodoro') {
                    startPomodoroMutation.mutate({
                      subject_id: Number(subjectId),
                      task_id: taskId ? Number(taskId) : null,
                      focus_minutes: Number(focusMinutes),
                      short_break_minutes: Number(shortBreakMinutes),
                      long_break_minutes: Number(longBreakMinutes),
                      total_rounds: Number(totalRounds),
                    })
                    return
                  }
                  startTimerMutation.mutate({
                    mode,
                    subject_id: Number(subjectId),
                    task_id: taskId ? Number(taskId) : null,
                    duration_minutes: mode === 'count_down' ? Number(durationMinutes) : null,
                  })
                }}
              >
                Start session
              </Button>
            ) : timer.is_paused ? (
              <Button onClick={() => resumeTimerMutation.mutate()}>Resume</Button>
            ) : (
              <Button variant="secondary" onClick={() => pauseTimerMutation.mutate()}>
                Pause
              </Button>
            )}

            {timer?.active ? (
              <Button variant="ghost" onClick={() => stopTimerMutation.mutate(undefined)}>
                Stop and store
              </Button>
            ) : null}

            {timer?.mode === 'pomodoro' && timer.active ? (
              <Button variant="secondary" onClick={() => skipPomodoroMutation.mutate()}>
                Skip phase
              </Button>
            ) : null}
          </div>
        </Panel>
      </section>
      </ScrollReveal>

      <ScrollReveal delayMs={140}>
        <Panel className="space-y-5">
          <SectionHeading title="Session setup" description="Choose the study lane, link a task when helpful, and pick the timer model that matches the work." />

          {subjects.length === 0 ? (
            <EmptyState title="Create a subject first" description="Sessions are grouped by subject so your progress, planning, and study records stay readable." />
          ) : (
            <div className="grid gap-4">
              <Select value={mode} onChange={(event) => setMode(event.target.value as 'count_up' | 'count_down' | 'pomodoro')}>
                <option value="count_up">Count up</option>
                <option value="count_down">Count down</option>
                <option value="pomodoro">Pomodoro</option>
              </Select>

              <Select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>

              <Select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                <option value="">No linked task</option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </Select>

              {mode === 'count_down' ? (
                <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                  Duration (minutes)
                  <Input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
                </label>
              ) : null}

              {mode === 'pomodoro' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                    Focus minutes
                    <Input
                      type="number"
                      min={1}
                      value={focusMinutes}
                      onChange={(event) =>
                        setPomodoroDraft({
                          focusMinutes: event.target.value,
                          shortBreakMinutes,
                          longBreakMinutes,
                          totalRounds,
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                    Short break
                    <Input
                      type="number"
                      min={1}
                      value={shortBreakMinutes}
                      onChange={(event) =>
                        setPomodoroDraft({
                          focusMinutes,
                          shortBreakMinutes: event.target.value,
                          longBreakMinutes,
                          totalRounds,
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                    Long break
                    <Input
                      type="number"
                      min={1}
                      value={longBreakMinutes}
                      onChange={(event) =>
                        setPomodoroDraft({
                          focusMinutes,
                          shortBreakMinutes,
                          longBreakMinutes: event.target.value,
                          totalRounds,
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                    Total rounds
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={totalRounds}
                      onChange={(event) =>
                        setPomodoroDraft({
                          focusMinutes,
                          shortBreakMinutes,
                          longBreakMinutes,
                          totalRounds: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}

              <div className="surface-subtle p-4 text-sm leading-7 text-[#6e6e73]">
                Saved rhythm: {formatMinutes(Number(focusMinutes))} focus, {formatMinutes(Number(shortBreakMinutes))} short break, and {Number(totalRounds)} rounds.
              </div>
            </div>
          )}
        </Panel>
      </ScrollReveal>
    </div>
  )
}
