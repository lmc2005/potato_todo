import type {
  ActionResult,
  ApiItem,
  ApiList,
  AssistantChatResult,
  AssistantConversationDetail,
  AssistantConversationSession,
  AssistantDraft,
  DailyQuote,
} from '@potato/contracts'

import { apiRequest, apiStream } from '@/shared/lib/api'

export type AssistantRequestInput = {
  start?: string
  end?: string
  instruction?: string
  conversation?: Array<{ role: string; content: string }>
}

export type ChatInput = {
  conversation_id?: number | null
  message: string
}

export type ChatStreamEvent =
  | { type: 'thinking' }
  | { type: 'chunk'; content: string }
  | { type: 'done'; item: AssistantChatResult }
  | { type: 'error'; detail: string }

export function planDraft(payload: AssistantRequestInput) {
  return apiRequest<ApiItem<AssistantDraft>>('/api/v2/assistant/plan', {
    method: 'POST',
    body: payload,
  })
}

export function analyzeDraft(payload: AssistantRequestInput) {
  return apiRequest<ApiItem<AssistantDraft>>('/api/v2/assistant/analyze', {
    method: 'POST',
    body: payload,
  })
}

export function listDrafts() {
  return apiRequest<ApiList<AssistantDraft>>('/api/v2/assistant/drafts')
}

export function applyDraft(draftId: number) {
  return apiRequest<ApiItem<Record<string, unknown>>>(`/api/v2/assistant/drafts/${draftId}/apply`, {
    method: 'POST',
  })
}

export function loadDailyQuote() {
  return apiRequest<ApiItem<DailyQuote>>('/api/v2/assistant/daily-quote')
}

export function listChatSessions() {
  return apiRequest<ApiList<AssistantConversationSession>>('/api/v2/assistant/chat/sessions')
}

export function loadChatSession(conversationId: number) {
  return apiRequest<ApiItem<AssistantConversationDetail>>(`/api/v2/assistant/chat/sessions/${conversationId}`)
}

export function deleteChatSession(conversationId: number) {
  return apiRequest<ActionResult>(`/api/v2/assistant/chat/sessions/${conversationId}`, {
    method: 'DELETE',
  })
}

export function sendChat(payload: ChatInput) {
  return apiRequest<ApiItem<AssistantChatResult>>('/api/v2/assistant/chat/send', {
    method: 'POST',
    body: payload,
  })
}

export function streamChat(payload: ChatInput, onEvent: (event: ChatStreamEvent) => Promise<void> | void) {
  return apiStream('/api/v2/assistant/chat/stream', {
    method: 'POST',
    body: payload,
    onLine: async (line) => {
      const event = JSON.parse(line) as ChatStreamEvent
      await onEvent(event)
    },
  })
}
