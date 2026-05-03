import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { createEvent, createSubject, createTask, deleteEvent, deleteSubject, deleteTask, updateTask, workspaceOverview } from '@/features/workspace/api'
import { MarqueeTicker } from '@/shared/components/marquee-ticker'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, Select } from '@/shared/components/ui'
import { formatDetailedDate, formatMinutes, formatShortDate, getWindowRange, toIsoOrNull } from '@/shared/lib/date'
import { describeError } from '@/shared/lib/errors'

function queryKey(start: string, end: string) {
  return ['workspace-overview', start, end]
}

export function RouteComponent() {
  const [range] = useState(() => getWindowRange(7))
  const [subjectName, setSubjectName] = useState('')
  const [subjectColor, setSubjectColor] = useState('#8cf2d6')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskSubjectId, setTaskSubjectId] = useState<string>('')
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [taskDueAt, setTaskDueAt] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventSubjectId, setEventSubjectId] = useState<string>('')
  const [eventTaskId, setEventTaskId] = useState<string>('')
  const [eventStartAt, setEventStartAt] = useState('')
  const [eventEndAt, setEventEndAt] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const client = useQueryClient()

  const overview = useQuery({
    queryKey: queryKey(range.start, range.end),
    queryFn: () => workspaceOverview(range.start, range.end),
  })

  const invalidateOverview = async () => {
    await client.invalidateQueries({
      queryKey: queryKey(range.start, range.end),
    })
  }

  const createSubjectMutation = useMutation({
    mutationFn: createSubject,
    onSuccess: async () => {
      setSubjectName('')
      setFeedback('Subject created.')
      await invalidateOverview()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const createTaskMutation = useMutation({
    mutationFn: createTask,
    onSuccess: async () => {
      setTaskTitle('')
      setTaskSubjectId('')
      setTaskPriority('medium')
      setTaskDueAt('')
      setFeedback('Task captured.')
      await invalidateOverview()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: Parameters<typeof updateTask>[1] }) => updateTask(taskId, payload),
    onSuccess: async () => {
      await invalidateOverview()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const deleteTaskMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: async () => {
      setFeedback('Task removed.')
      await invalidateOverview()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const createEventMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: async () => {
      setEventTitle('')
      setEventSubjectId('')
      setEventTaskId('')
      setEventStartAt('')
      setEventEndAt('')
      setFeedback('Calendar block created.')
      await invalidateOverview()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const deleteEventMutation = useMutation({
    mutationFn: deleteEvent,
    onSuccess: async () => {
      setFeedback('Calendar block removed.')
      await invalidateOverview()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const deleteSubjectMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: async () => {
      setFeedback('Subject removed.')
      await invalidateOverview()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const subjects = overview.data?.subjects ?? []
  const tasks = overview.data?.tasks ?? []
  const events = overview.data?.events ?? []
  const stats = overview.data?.stats
  const openTasks = tasks.filter((task) => task.status !== 'done')
  const topSubject = stats?.subject_breakdown[0]
  const nextTask = [...openTasks]
    .filter((task) => Boolean(task.due_at))
    .sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))[0]
  const nextEvent = [...events].sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)))[0]

  const quickStats = [
    {
      label: 'Open tasks',
      value: String(openTasks.length),
      detail: nextTask?.title ?? 'Capture the next thing that matters.',
    },
    {
      label: 'Focus time',
      value: stats ? formatMinutes(stats.total_minutes) : '--',
      detail: stats ? `${stats.session_count} sessions in this window` : 'Sessions will appear as you focus.',
    },
    {
      label: 'Study lanes',
      value: String(subjects.length),
      detail: topSubject?.name ?? 'Create a lane for each stream of work.',
    },
    {
      label: 'Next block',
      value: nextEvent ? formatShortDate(nextEvent.start_at) : 'Open',
      detail: nextEvent?.title ?? 'Place a study block on the calendar.',
    },
  ]

  const storyItems = [
    {
      label: 'What is due',
      title: nextTask?.title ?? 'Your next due task waits here.',
      detail: nextTask?.due_at ? `Due ${formatShortDate(nextTask.due_at)} and ready to start.` : 'As soon as a dated task lands, it becomes the first signal on the page.',
    },
    {
      label: 'Where time is going',
      title: topSubject?.name ?? 'The leading study lane will surface here.',
      detail: topSubject ? `${Math.round(topSubject.share * 100)}% of tracked focus has gone into this lane.` : 'Once a few sessions are logged, the week starts to show its shape.',
    },
    {
      label: 'What is already scheduled',
      title: nextEvent?.title ?? 'Your next block is ready to be placed.',
      detail: nextEvent ? `${formatDetailedDate(nextEvent.start_at)} is the next fixed window on the desk.` : 'Calendar blocks help the day read like a sequence rather than a pile.',
    },
  ]

  const heroMeta = [
    openTasks.length > 0 ? `${openTasks.length} open items` : 'Open surface waiting',
    stats ? `${formatMinutes(stats.total_minutes)} focus logged` : 'Focus log standing by',
    nextEvent ? `Next block ${formatShortDate(nextEvent.start_at)}` : 'Next block still open',
  ]

  const stageRows = [
    {
      label: 'Next task',
      title: nextTask?.title ?? 'Capture the first task',
      detail: nextTask?.due_at ? `Due ${formatShortDate(nextTask.due_at)} and ready to move.` : 'No dated task is waiting yet.',
    },
    {
      label: 'Top lane',
      title: topSubject?.name ?? 'No focus leader yet',
      detail: topSubject ? `${Math.round(topSubject.share * 100)}% of tracked focus is landing here.` : 'The strongest lane appears after a few sessions.',
    },
    {
      label: 'Next block',
      title: nextEvent?.title ?? 'Place a study block',
      detail: nextEvent ? `${formatDetailedDate(nextEvent.start_at)} is already reserved.` : 'Nothing is scheduled yet.',
    },
  ]

  return (
    <div className="grid gap-10">
      <section className="repay-hero-bg">
        <div className="workspace-hero-intro">
          <ScrollReveal className="mx-auto w-full max-w-[960px] text-center">
            <p className="eyebrow">The smart way to study.</p>
            <div className="mt-7 space-y-4">
              <p className="hero-leadline text-black">Reimagine the study desk,</p>
              <h1 className="hero-accentline gradient-heading">simple momentum.</h1>
            </div>
            <p className="hero-subcopy mt-7">
              Tasks, focus sessions, planning drafts, and study blocks stay on one flowing page so the day reads in order instead of breaking into isolated cards.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/app/focus" className="btn-base btn-primary">
                Start focus
              </Link>
              <Link to="/app/agent" className="btn-base btn-secondary">
                Open agent
              </Link>
            </div>
            <div className="hero-meta-strip">
              {heroMeta.map((item) => (
                <span key={item} className="hero-meta-item">
                  {item}
                </span>
              ))}
            </div>
          </ScrollReveal>

          <div className="workspace-hero-ticker-wrap">
            <MarqueeTicker />
          </div>
        </div>

        <ScrollReveal className="repay-stage" delayMs={90}>
          <div className="repay-stage-screen grid gap-6 lg:grid-cols-[1.06fr_0.94fr] lg:items-start">
            <div className="grid content-start gap-8 lg:pr-3">
              <div className="space-y-4">
                <p className="eyebrow">Today at a glance</p>
                <h2 className="section-title text-black">
                  Keep the week clear,
                  <br />
                  before it fills up.
                </h2>
                <p className="max-w-[39rem] text-[1rem] leading-8 tracking-[-0.016em] text-[#40424f]">
                  The desk opens with the next task, the strongest lane, the next scheduled block, and the focus time that gives the week its pace.
                </p>
              </div>

              <div className="stage-copy-list">
                {stageRows.map((item) => (
                  <div key={item.label} className="stage-copy-row">
                    <p className="eyebrow">{item.label}</p>
                    <p className="stage-copy-row-title mt-3">{item.title}</p>
                    <p className="stage-copy-row-detail">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="workspace-preview-shell">
              <div className="workspace-preview-window">
                <div className="workspace-preview-hero">
                  <div className="space-y-3">
                    <p className="eyebrow">Weekly focus</p>
                    <p className="workspace-preview-value">{stats ? formatMinutes(stats.total_minutes) : '0m'}</p>
                  </div>
                  <p className="workspace-preview-card-note">
                    {stats ? `${stats.session_count} study sessions are logged in the current range.` : 'Focus time will land here as the week starts to take shape.'}
                  </p>
                </div>

                <div className="workspace-preview-grid">
                  <div className="workspace-preview-card">
                    <p className="eyebrow">Open surface</p>
                    <p className="workspace-preview-card-value">{openTasks.length}</p>
                    <p className="workspace-preview-card-note">active items waiting to move</p>
                  </div>

                  <div className="workspace-preview-card">
                    <p className="eyebrow">Current streak</p>
                    <p className="workspace-preview-card-value">{stats?.streak_days ?? 0} days</p>
                    <p className="workspace-preview-card-note">steady focus keeps this line moving</p>
                  </div>
                </div>

                <div className="workspace-preview-list">
                  <div className="workspace-preview-list-item">
                    <p className="eyebrow">Current read</p>
                    <p className="workspace-preview-inline-value">{nextEvent?.title ?? 'No fixed block yet'}</p>
                    <p className="workspace-preview-card-note">
                      {nextEvent ? `${formatDetailedDate(nextEvent.start_at)} is the next fixed window.` : 'The next scheduled block appears here once it is placed.'}
                    </p>
                  </div>

                  <div className="workspace-preview-list-item">
                    <p className="eyebrow">Window</p>
                    <p className="workspace-preview-inline-value">{range.start} to {range.end}</p>
                    <p className="workspace-preview-card-note">
                      {topSubject ? `Top lane ${topSubject.name} is holding ${Math.round(topSubject.share * 100)}% of the tracked focus.` : 'The strongest lane will surface once focus is tracked.'}
                    </p>
                  </div>
                </div>

                <div className="workspace-preview-footer">
                  <span>{stats ? `${stats.session_count} study sessions in range` : '0 study sessions in range'}</span>
                  <span>{subjects.length} study lanes in view</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('failed') || feedback.toLowerCase().includes('error') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {overview.error ? <InlineMessage tone="danger">{describeError(overview.error)}</InlineMessage> : null}

      <ScrollReveal>
        <section className="repay-band md:grid-cols-4">
          {quickStats.map((item) => (
            <div key={item.label} className="repay-stat">
              <p className="eyebrow">{item.label}</p>
              <p className="mt-4 text-[1.85rem] font-medium tracking-[-0.04em] text-black">{item.value}</p>
              <p className="mt-2 text-sm leading-7 text-[#666d80]">{item.detail}</p>
            </div>
          ))}
        </section>
      </ScrollReveal>

      <section className="grid gap-10 xl:grid-cols-[0.95fr_1.05fr] xl:items-start">
        <div className="space-y-2">
          {storyItems.map((item, index) => (
            <ScrollReveal key={item.label} delayMs={index * 90}>
              <article className="story-item">
                <p className="eyebrow">{item.label}</p>
                <h3 className="mt-4 text-[2rem] font-medium leading-[0.96] tracking-[-0.05em] text-black">{item.title}</h3>
                <p className="mt-3 max-w-xl text-[0.99rem] leading-8 tracking-[-0.016em] text-[#40424f]">{item.detail}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal className="xl:sticky xl:top-28" delayMs={120}>
          <div className="story-visual">
            <div className="rounded-[34px] bg-white p-6">
              <p className="eyebrow">Workspace flow</p>
              <h2 className="mt-4 text-[2.3rem] font-medium leading-[0.94] tracking-[-0.05em] text-black">
                One screen,
                <br />
                then the rest unfolds.
              </h2>
              <p className="mt-4 text-sm leading-8 tracking-[-0.014em] text-[#40424f]">
                The page opens with the big picture, then the task list, subject lanes, and calendar blocks arrive in order as you scroll down.
              </p>

              <div className="mt-8 space-y-4">
                <div className="rounded-[26px] bg-[#f3f3f3] p-5">
                  <p className="eyebrow">Task runway</p>
                  <p className="mt-3 text-lg font-medium tracking-[-0.03em] text-black">Capture, start, and finish what is next.</p>
                </div>
                <div className="rounded-[26px] bg-[#f3f3f3] p-5">
                  <p className="eyebrow">Subject lanes</p>
                  <p className="mt-3 text-lg font-medium tracking-[-0.03em] text-black">Keep the week grouped by stream instead of by noise.</p>
                </div>
                <div className="rounded-[26px] bg-[#f3f3f3] p-5">
                  <p className="eyebrow">Calendar blocks</p>
                  <p className="mt-3 text-lg font-medium tracking-[-0.03em] text-black">Place study time where it can actually happen.</p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      <ScrollReveal>
        <section className="blend-section">
          <div className="grid gap-8 xl:grid-cols-[0.64fr_1.36fr]">
            <div className="space-y-4">
              <p className="eyebrow">Task runway</p>
              <h2 className="section-title text-black">Capture what matters, then move it forward.</h2>
              <p className="body-copy">New tasks land first, active work stays visible, and completion is only one step away once the next item is clear.</p>
            </div>

            <div className="space-y-6">
              <form
                className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_150px_180px_auto]"
                onSubmit={(event) => {
                  event.preventDefault()
                  setFeedback(null)
                  createTaskMutation.mutate({
                    title: taskTitle,
                    subject_id: taskSubjectId ? Number(taskSubjectId) : null,
                    priority: taskPriority,
                    due_at: toIsoOrNull(taskDueAt),
                  })
                }}
              >
                <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Capture a task, commitment, or follow-up" required />
                <Select value={taskSubjectId} onChange={(event) => setTaskSubjectId(event.target.value)}>
                  <option value="">No subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
                <Select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as 'low' | 'medium' | 'high')}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
                <Input type="datetime-local" value={taskDueAt} onChange={(event) => setTaskDueAt(event.target.value)} />
                <Button type="submit" disabled={createTaskMutation.isPending}>
                  Add task
                </Button>
              </form>

              {overview.isLoading ? (
                <div className="text-sm text-[#666d80]">Loading workspace overview...</div>
              ) : openTasks.length === 0 ? (
                <EmptyState title="No open tasks" description="Newly captured tasks will appear here and stay in view until they move." />
              ) : (
                <div>
                  {openTasks.map((task) => (
                    <div key={task.id} className="repay-row">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-3 text-sm text-[#666d80]">
                            <span>{task.status.replace('_', ' ')}</span>
                            <span style={{ color: task.subject_color }}>{task.subject ?? 'Unassigned'}</span>
                            <span>{task.priority}</span>
                          </div>
                          <div>
                            <p className="text-[1.18rem] font-semibold tracking-[-0.04em] text-black">{task.title}</p>
                            <p className="mt-2 text-sm leading-7 text-[#666d80]">Due {formatShortDate(task.due_at)} · Created {formatDetailedDate(task.created_at)}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {task.status !== 'in_progress' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => updateTaskMutation.mutate({ taskId: task.id, payload: { status: 'in_progress' } })}
                            >
                              Start
                            </Button>
                          ) : null}
                          {task.status !== 'done' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => updateTaskMutation.mutate({ taskId: task.id, payload: { status: 'done' } })}
                            >
                              Done
                            </Button>
                          ) : null}
                          <Button variant="ghost" size="sm" onClick={() => deleteTaskMutation.mutate(task.id)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="blend-section">
          <div className="grid gap-8 xl:grid-cols-[0.62fr_1.38fr]">
            <div className="space-y-4">
              <p className="eyebrow">Subject lanes</p>
              <h2 className="section-title text-black">Keep the week grouped by stream, not by noise.</h2>
              <p className="body-copy">Subjects hold daily goals, focus history, and planning context so the rest of the desk has somewhere to connect.</p>
            </div>

            <div className="space-y-6">
              <form
                className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto]"
                onSubmit={(event) => {
                  event.preventDefault()
                  setFeedback(null)
                  createSubjectMutation.mutate({
                    name: subjectName,
                    color: subjectColor,
                  })
                }}
              >
                <Input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="Create a subject lane" required />
                <Input type="color" className="h-[54px]" value={subjectColor} onChange={(event) => setSubjectColor(event.target.value)} />
                <Button type="submit" disabled={createSubjectMutation.isPending}>
                  Add subject
                </Button>
              </form>

              {subjects.length === 0 ? (
                <EmptyState title="No subjects yet" description="Start with one study lane and the rest of the workspace will begin to organize around it." />
              ) : (
                <div>
                  {subjects.map((subject) => (
                    <div key={subject.id} className="repay-row">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: subject.color }} />
                          <div>
                            <p className="text-[1.15rem] font-semibold tracking-[-0.04em] text-black">{subject.name}</p>
                            <p className="mt-2 text-sm leading-7 text-[#666d80]">
                              {formatMinutes(subject.daily_goal_minutes)} daily goal · {formatMinutes(Math.round(subject.total_focus_seconds / 60))} logged
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deleteSubjectMutation.mutate(subject.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="blend-section">
          <div className="grid gap-8 xl:grid-cols-[0.62fr_1.38fr]">
            <div className="space-y-4">
              <p className="eyebrow">Calendar blocks</p>
              <h2 className="section-title text-black">Place the work where it can actually happen.</h2>
              <p className="body-copy">Study blocks keep the day from collapsing into pure intention. Link them to a task when timing matters.</p>
            </div>

            <div className="space-y-6">
              <form
                className="grid gap-3 lg:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  setFeedback(null)
                  createEventMutation.mutate({
                    title: eventTitle,
                    subject_id: eventSubjectId ? Number(eventSubjectId) : null,
                    task_id: eventTaskId ? Number(eventTaskId) : null,
                    start_at: new Date(eventStartAt).toISOString(),
                    end_at: new Date(eventEndAt).toISOString(),
                  })
                }}
              >
                <Input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Block title" required />
                <Select value={eventSubjectId} onChange={(event) => setEventSubjectId(event.target.value)}>
                  <option value="">No subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
                <Select value={eventTaskId} onChange={(event) => setEventTaskId(event.target.value)}>
                  <option value="">No linked task</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </Select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="datetime-local" value={eventStartAt} onChange={(event) => setEventStartAt(event.target.value)} required />
                  <Input type="datetime-local" value={eventEndAt} onChange={(event) => setEventEndAt(event.target.value)} required />
                </div>
                <Button type="submit" className="lg:col-span-2" disabled={createEventMutation.isPending}>
                  Add calendar block
                </Button>
              </form>

              {events.length === 0 ? (
                <EmptyState title="No calendar blocks" description="Place a block once you know when the next focused window can happen." />
              ) : (
                <div>
                  {events.map((event) => (
                    <div key={event.id} className="repay-row">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-[1.15rem] font-semibold tracking-[-0.04em] text-black">{event.title}</p>
                          <p className="mt-2 text-sm leading-7 text-[#666d80]">
                            {formatDetailedDate(event.start_at)} to {formatDetailedDate(event.end_at)}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deleteEventMutation.mutate(event.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {stats ? (
        <ScrollReveal>
          <section className="dark-panel px-6 py-8 sm:px-8 sm:py-10">
            <div className="grid gap-8 xl:grid-cols-[0.72fr_1.28fr]">
              <div className="space-y-4">
                <p className="eyebrow text-white/58">Weekly pulse</p>
                <h2 className="section-title text-white">A final read on how the week is moving.</h2>
                <p className="max-w-xl text-sm leading-8 text-white/74">
                  Logged focus, current streak, and the leading subject mix close the page with a simple summary instead of another set of boxed modules.
                </p>
              </div>

              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-[28px] bg-white/6 p-5">
                    <p className="text-sm text-white/62">Current streak</p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-white">{stats.streak_days} days</p>
                  </div>
                  <div className="rounded-[28px] bg-white/6 p-5">
                    <p className="text-sm text-white/62">Sessions in range</p>
                    <p className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-white">{stats.session_count}</p>
                  </div>
                </div>

                {stats.subject_breakdown.length === 0 ? (
                  <EmptyState title="No logged focus yet" description="Tracked sessions will feed this closing summary after a few focus runs." />
                ) : (
                  <div>
                    {stats.subject_breakdown.slice(0, 5).map((item) => (
                      <div key={`${item.subject_id}-${item.name}`} className="repay-row border-white/10">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="font-medium text-white">{item.name}</span>
                          </div>
                          <span className="text-sm text-white/72">
                            {formatMinutes(item.minutes)} · {Math.round(item.share * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </ScrollReveal>
      ) : null}
    </div>
  )
}
