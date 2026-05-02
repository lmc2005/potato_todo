import type { ApiResult, PomodoroSettings, TimerPayload } from '@potato/contracts'

import { apiRequest } from '@/shared/lib/api'

export type TimerStartInput = {
  mode: 'count_up' | 'count_down'
  subject_id: number
  task_id?: number | null
  schedule_event_id?: number | null
  duration_minutes?: number | null
}

export type TimerStopInput = {
  adjusted_focus_minutes?: number | null
}

export type PomodoroStartInput = {
  subject_id: number
  task_id?: number | null
  schedule_event_id?: number | null
  focus_minutes: number
  short_break_minutes: number
  long_break_minutes: number
  total_rounds: number
}

export function loadCurrentTimer() {
  return apiRequest<ApiResult<TimerPayload>>('/api/v2/timer/current')
}

export function startTimer(payload: TimerStartInput) {
  return apiRequest<ApiResult<TimerPayload>>('/api/v2/timer/start', {
    method: 'POST',
    body: payload,
  })
}

export function pauseTimer() {
  return apiRequest<ApiResult<TimerPayload>>('/api/v2/timer/pause', {
    method: 'POST',
  })
}

export function resumeTimer() {
  return apiRequest<ApiResult<TimerPayload>>('/api/v2/timer/resume', {
    method: 'POST',
  })
}

export function stopTimer(payload?: TimerStopInput) {
  return apiRequest<ApiResult<TimerPayload>>('/api/v2/timer/stop', {
    method: 'POST',
    body: payload ?? {},
  })
}

export function startPomodoro(payload: PomodoroStartInput) {
  return apiRequest<ApiResult<TimerPayload>>('/api/v2/timer/pomodoro/start', {
    method: 'POST',
    body: payload,
  })
}

export function skipPomodoro() {
  return apiRequest<ApiResult<TimerPayload>>('/api/v2/timer/pomodoro/skip', {
    method: 'POST',
  })
}

export function loadPomodoroSettings() {
  return apiRequest<{ settings: PomodoroSettings }>('/api/v2/settings/pomodoro')
}
