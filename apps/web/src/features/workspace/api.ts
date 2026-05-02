import type {
  ActionResult,
  ApiItem,
  ApiList,
  ApiStats,
  CalendarEventRecord,
  StatsPayload,
  SubjectRecord,
  TaskRecord,
} from '@potato/contracts'

import { apiRequest } from '@/shared/lib/api'

export type SubjectInput = {
  name: string
  color?: string
  daily_goal_minutes?: number
  weekly_goal_minutes?: number
  monthly_goal_minutes?: number
  archived?: boolean
}

export type SubjectPatchInput = Partial<SubjectInput>

export type TaskInput = {
  title: string
  subject_id?: number | null
  status?: 'todo' | 'in_progress' | 'done' | 'undone'
  priority?: 'low' | 'medium' | 'high'
  due_at?: string | null
  estimated_minutes?: number | null
  notes?: string | null
}

export type TaskPatchInput = Partial<TaskInput> & {
  completed_at?: string | null
}

export type EventInput = {
  title: string
  subject_id?: number | null
  task_id?: number | null
  start_at: string
  end_at: string
  source?: 'manual' | 'ai'
  notes?: string | null
}

export type EventPatchInput = Partial<EventInput>

export function listSubjects(includeArchived = false) {
  return apiRequest<ApiList<SubjectRecord>>(`/api/v2/subjects?include_archived=${String(includeArchived)}`)
}

export function createSubject(payload: SubjectInput) {
  return apiRequest<ApiItem<SubjectRecord>>('/api/v2/subjects', {
    method: 'POST',
    body: payload,
  })
}

export function updateSubject(subjectId: number, payload: SubjectPatchInput) {
  return apiRequest<ApiItem<SubjectRecord>>(`/api/v2/subjects/${subjectId}`, {
    method: 'PATCH',
    body: payload,
  })
}

export function deleteSubject(subjectId: number) {
  return apiRequest<ActionResult>(`/api/v2/subjects/${subjectId}`, {
    method: 'DELETE',
  })
}

export function listTasks(status?: string) {
  const search = status ? `?status=${encodeURIComponent(status)}` : ''
  return apiRequest<ApiList<TaskRecord>>(`/api/v2/tasks${search}`)
}

export function createTask(payload: TaskInput) {
  return apiRequest<ApiItem<TaskRecord>>('/api/v2/tasks', {
    method: 'POST',
    body: payload,
  })
}

export function updateTask(taskId: number, payload: TaskPatchInput) {
  return apiRequest<ApiItem<TaskRecord>>(`/api/v2/tasks/${taskId}`, {
    method: 'PATCH',
    body: payload,
  })
}

export function deleteTask(taskId: number) {
  return apiRequest<ActionResult>(`/api/v2/tasks/${taskId}`, {
    method: 'DELETE',
  })
}

export function listEvents(start: string, end: string) {
  return apiRequest<ApiList<CalendarEventRecord>>(`/api/v2/calendar/events?start=${start}&end=${end}`)
}

export function createEvent(payload: EventInput) {
  return apiRequest<ApiItem<CalendarEventRecord>>('/api/v2/calendar/events', {
    method: 'POST',
    body: payload,
  })
}

export function updateEvent(eventId: number, payload: EventPatchInput) {
  return apiRequest<ApiItem<CalendarEventRecord>>(`/api/v2/calendar/events/${eventId}`, {
    method: 'PATCH',
    body: payload,
  })
}

export function deleteEvent(eventId: number) {
  return apiRequest<ActionResult>(`/api/v2/calendar/events/${eventId}`, {
    method: 'DELETE',
  })
}

export function loadStats(start: string, end: string) {
  return apiRequest<ApiStats>(`/api/v2/analytics/stats?start=${start}&end=${end}`)
}

export async function workspaceOverview(start: string, end: string): Promise<{
  subjects: SubjectRecord[]
  tasks: TaskRecord[]
  events: CalendarEventRecord[]
  stats: StatsPayload
}> {
  const [subjects, tasks, events, stats] = await Promise.all([
    listSubjects(false),
    listTasks(),
    listEvents(start, end),
    loadStats(start, end),
  ])

  return {
    subjects: subjects.items,
    tasks: tasks.items,
    events: events.items,
    stats: stats.stats,
  }
}
