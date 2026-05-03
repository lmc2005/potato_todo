import type { TimerPayload } from '@potato/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { loadCurrentTimer, loadPomodoroSettings, pauseTimer, resumeTimer, skipPomodoro, startPomodoro, startTimer, stopTimer } from '@/features/focus/api'
import { listSubjects, listTasks } from '@/features/workspace/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, Select } from '@/shared/components/ui'
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

function clamp01(value: number) {
  if (Number.isNaN(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

function timerAccent(timer: TimerPayload | undefined) {
  if (timer?.mode === 'pomodoro' && timer.pomodoro_phase === 'break') {
    return '#74cafc'
  }
  if (timer?.mode === 'count_down') {
    return '#6dd3ff'
  }
  return '#796dff'
}

function deriveProgress(timer: TimerPayload | undefined, displaySeconds: number, elapsedSeconds: number, draftDurationMinutes: number, draftFocusMinutes: number) {
  if (!timer?.active) {
    return 0
  }

  if (timer.mode === 'count_down') {
    const total = Math.max((timer.countdown_seconds ?? draftDurationMinutes * 60) || 1, 1)
    return clamp01(1 - Math.max(displaySeconds, 0) / total)
  }

  if (timer.mode === 'pomodoro') {
    const total = Math.max((timer.countdown_seconds ?? draftFocusMinutes * 60) || 1, 1)
    return clamp01(1 - Math.max(displaySeconds, 0) / total)
  }

  return clamp01(elapsedSeconds / (60 * 60))
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
  const selectedSubject = subjects.find((subject) => subject.id === Number(subjectId))
  const selectedTask = tasks.find((task) => task.id === Number(taskId))
  const accent = timerAccent(timer)
  const progressRatio = deriveProgress(timer, derived.displaySeconds, derived.elapsedSeconds, Number(durationMinutes), Number(focusMinutes))
  const orbitStyle = {
    '--focus-progress': String(progressRatio),
    '--focus-accent': accent,
  } as CSSProperties
  const phaseNote =
    timer?.mode === 'pomodoro'
      ? timer.pomodoro_phase === 'break'
        ? 'Break window is active. The ring cools down until the next focus round.'
        : `Focus round ${timer.pomodoro_round ?? 1} of ${timer.pomodoro_total_rounds ?? Number(totalRounds)} is active.`
      : timer?.remaining_seconds != null
        ? `${formatDuration(derived.remainingSeconds ?? 0)} remaining in the current countdown.`
        : `${formatDuration(derived.elapsedSeconds)} recorded in this live session.`
  const stageChips = [
    timer?.active ? timerStatusLabel(timer) : `Mode ${mode.replace('_', ' ')}`,
    timer?.active ? `Subject ${activeSubject?.name ?? 'Unlinked'}` : `Setup ${selectedSubject?.name ?? 'pick a subject'}`,
    isVisible ? 'Desktop live' : 'Background quiet mode',
  ]

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
    <div className="focus-page grid gap-8">
      <ScrollReveal>
        <section className="focus-hero-stage">
          <div className="focus-copy-pane">
            <p className="eyebrow">Focus</p>
            <h1 className="focus-stage-title">
              Stay in the work
              <br />
              until the clock
              <br />
              <span className="gradient-heading">disappears.</span>
            </h1>
            <p className="focus-stage-copy">
              One immersive timing surface for deep work, countdown sprints, and Pomodoro loops. The visuals stay rich, but the runtime stays calm.
            </p>

            <div className="focus-chip-row">
              {stageChips.map((item) => (
                <span key={item} className="focus-stage-chip">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="focus-orbit-board" style={orbitStyle}>
            <div className="focus-orbit-ring">
              <div className="focus-orbit-core">
                <p className="focus-orbit-kicker">{timer?.active ? (timer.is_paused ? 'Paused' : 'Live session') : 'Ready state'}</p>
                <p className="focus-orbit-time">{formatDuration(derived.displaySeconds)}</p>
                <p className="focus-orbit-caption">{phaseNote}</p>
              </div>
            </div>

            <div className="focus-action-row">
              {!timer?.active ? (
                <Button
                  className="min-w-[148px]"
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
                <Button className="min-w-[148px]" onClick={() => resumeTimerMutation.mutate()}>
                  Resume
                </Button>
              ) : (
                <Button className="min-w-[148px]" variant="secondary" onClick={() => pauseTimerMutation.mutate()}>
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
          </div>
        </section>
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {currentTimerQuery.error ? <InlineMessage tone="danger">{describeError(currentTimerQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
        <section className="focus-detail-grid">
          <article className="focus-detail-card">
            <p className="eyebrow">Current lane</p>
            <p className="focus-detail-title">{timer?.active ? activeSubject?.name ?? 'Open subject' : selectedSubject?.name ?? 'Choose a subject'}</p>
            <p className="focus-detail-copy">
              {timer?.active
                ? activeTask?.title ?? 'This session is not linked to a task yet.'
                : selectedTask?.title ?? 'Link a task when you want the session to land in a specific work item.'}
            </p>
          </article>

          <article className="focus-detail-card">
            <p className="eyebrow">Session state</p>
            <p className="focus-detail-title">{timer?.active ? (timer.is_paused ? 'Paused' : 'In motion') : 'Idle and ready'}</p>
            <p className="focus-detail-copy">
              {isVisible
                ? 'The local timer is actively advancing on screen and periodically syncing with the backend.'
                : 'Background tabs stay calmer. The page reduces work until you come back.'}
            </p>
          </article>

          <article className="focus-detail-card">
            <p className="eyebrow">Saved rhythm</p>
            <p className="focus-detail-title">
              {formatMinutes(Number(focusMinutes))} / {formatMinutes(Number(shortBreakMinutes))}
            </p>
            <p className="focus-detail-copy">
              {mode === 'pomodoro'
                ? `${Number(totalRounds)} rounds, with ${formatMinutes(Number(longBreakMinutes))} for long breaks.`
                : 'Switch into Pomodoro mode at any time to reuse your saved focus and break defaults.'}
            </p>
          </article>
        </section>
      </ScrollReveal>

      <ScrollReveal delayMs={80}>
        <section className="focus-setup-shell">
          <div className="focus-setup-header">
            <div className="space-y-3">
              <p className="eyebrow">Session setup</p>
              <h2 className="focus-setup-title">Shape the study run before it starts.</h2>
              <p className="focus-setup-copy">
                Choose the lane, decide whether this is a free run, a bounded sprint, or a Pomodoro cycle, and optionally tie the session to a task.
              </p>
            </div>
          </div>

          {subjects.length === 0 ? (
            <EmptyState title="Create a subject first" description="Sessions are grouped by subject so your progress, planning, and study records stay readable." />
          ) : (
            <div className="grid gap-5">
              <div className="focus-mode-switch">
                {[
                  { value: 'count_up', label: 'Count up' },
                  { value: 'count_down', label: 'Count down' },
                  { value: 'pomodoro', label: 'Pomodoro' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`focus-mode-chip ${mode === option.value ? 'is-active' : ''}`}
                    onClick={() => setMode(option.value as 'count_up' | 'count_down' | 'pomodoro')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="focus-form-grid">
                <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                  Subject
                  <Select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                    <option value="">Select subject</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                  Linked task
                  <Select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                    <option value="">No linked task</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </Select>
                </label>

                {mode === 'count_down' ? (
                  <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                    Duration (minutes)
                    <Input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
                  </label>
                ) : null}

                {mode === 'pomodoro' ? (
                  <>
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
                  </>
                ) : null}
              </div>

              <div className="focus-rhythm-note">
                Saved rhythm: {formatMinutes(Number(focusMinutes))} focus, {formatMinutes(Number(shortBreakMinutes))} short break, {formatMinutes(Number(longBreakMinutes))} long break, and {Number(totalRounds)} rounds.
              </div>
            </div>
          )}
        </section>
      </ScrollReveal>
    </div>
  )
}
