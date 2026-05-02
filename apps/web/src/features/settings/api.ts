import type {
  ActionResult,
  ApiSettings,
  LlmSettings,
  PomodoroSettings,
} from '@potato/contracts'

import { apiRequest } from '@/shared/lib/api'

export type LlmSettingsInput = {
  base_url?: string | null
  api_key?: string | null
  model?: string | null
  reasoning_effort?: string | null
}

export type PomodoroSettingsInput = PomodoroSettings

export function loadLlmSettings() {
  return apiRequest<ApiSettings<LlmSettings>>('/api/v2/settings/llm')
}

export function saveLlmSettings(payload: LlmSettingsInput) {
  return apiRequest<ApiSettings<LlmSettings>>('/api/v2/settings/llm', {
    method: 'POST',
    body: payload,
  })
}

export function loadPomodoroSettings() {
  return apiRequest<ApiSettings<PomodoroSettings>>('/api/v2/settings/pomodoro')
}

export function savePomodoroSettings(payload: PomodoroSettingsInput) {
  return apiRequest<ApiSettings<PomodoroSettings>>('/api/v2/settings/pomodoro', {
    method: 'POST',
    body: payload,
  })
}

export function exportBackup() {
  return apiRequest<Response>('/api/v2/backup/export', {
    raw: true,
  })
}

export function importBackup(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return apiRequest<ActionResult>('/api/v2/backup/import', {
    method: 'POST',
    body: formData,
  })
}

export function clearBackup() {
  return apiRequest<ActionResult>('/api/v2/backup/clear', {
    method: 'POST',
    body: {
      confirm: true,
    },
  })
}
