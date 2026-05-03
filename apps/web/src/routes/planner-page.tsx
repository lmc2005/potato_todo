import type { AssistantDraft, LlmSettings } from '@potato/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { analyzeDraft, applyDraft, deleteChatSession, listChatSessions, listDrafts, loadChatSession, loadDailyQuote, planDraft, sendChat } from '@/features/planner/api'
import { loadLlmSettings, saveLlmSettings } from '@/features/settings/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, Panel, Select, Textarea } from '@/shared/components/ui'
import { getWindowRange } from '@/shared/lib/date'
import { describeError } from '@/shared/lib/errors'

type AgentMode = 'planning' | 'chat'

const modelOptions = ['gpt-5.4', 'gpt-5.5', 'gpt-5.3-codex']
const reasoningOptions = ['xhigh', 'high', 'medium', 'low', 'none']

function sessionIdOf(session: Record<string, unknown>) {
  return typeof session.id === 'number' ? session.id : null
}

function sessionTitleOf(session: Record<string, unknown>) {
  return typeof session.title === 'string' && session.title ? session.title : 'Untitled conversation'
}

function draftCounts(draft: AssistantDraft) {
  const payload = draft.payload as Record<string, unknown>
  const tasks = Array.isArray(payload.tasks) ? payload.tasks.length : 0
  const events = Array.isArray(payload.schedule_events) ? payload.schedule_events.length : 0
  return { tasks, events }
}

function DraftPreview({ draft }: { draft: AssistantDraft }) {
  const payload = draft.payload as Record<string, unknown>
  const summary = typeof payload.summary === 'string' ? payload.summary : null
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : []
  const events = Array.isArray(payload.schedule_events) ? payload.schedule_events : []
  const patterns = Array.isArray(payload.patterns) ? payload.patterns : []
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : []
  const risks = Array.isArray(payload.risks) ? payload.risks : []

  return (
    <div className="grid gap-4">
      {summary ? (
        <div className="agent-note-card">
          <p className="eyebrow">Summary</p>
          <p className="agent-note-copy">{summary}</p>
        </div>
      ) : null}

      {tasks.length > 0 ? (
        <div className="agent-surface-card">
          <p className="eyebrow">Tasks</p>
          <div className="agent-bullet-list">
            {tasks.map((task, index) => {
              const row = task as Record<string, unknown>
              return (
                <div key={`${String(row.title ?? 'task')}-${index}`} className="agent-list-row">
                  <p className="agent-list-title">{String(row.title ?? 'Untitled task')}</p>
                  <p className="agent-list-detail">{String(row.reason ?? row.notes ?? 'No rationale supplied.')}</p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="agent-surface-card">
          <p className="eyebrow">Schedule blocks</p>
          <div className="agent-bullet-list">
            {events.map((event, index) => {
              const row = event as Record<string, unknown>
              return (
                <div key={`${String(row.title ?? 'event')}-${index}`} className="agent-list-row">
                  <p className="agent-list-title">{String(row.title ?? 'Untitled block')}</p>
                  <p className="agent-list-detail">
                    {String(row.start_at ?? '--')} to {String(row.end_at ?? '--')}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {patterns.length > 0 || recommendations.length > 0 || risks.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {patterns.length > 0 ? (
            <div className="agent-surface-card">
              <p className="eyebrow">Patterns</p>
              <div className="agent-bullet-list">
                {patterns.map((item, index) => (
                  <div key={`pattern-${index}`} className="agent-list-row">
                    <p className="agent-list-detail">{String(item)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {recommendations.length > 0 ? (
            <div className="agent-surface-card">
              <p className="eyebrow">Recommendations</p>
              <div className="agent-bullet-list">
                {recommendations.map((item, index) => (
                  <div key={`recommendation-${index}`} className="agent-list-row">
                    <p className="agent-list-detail">{String(item)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {risks.length > 0 ? (
            <div className="agent-surface-card">
              <p className="eyebrow">Risks</p>
              <div className="agent-bullet-list">
                {risks.map((item, index) => (
                  <div key={`risk-${index}`} className="agent-list-row">
                    <p className="agent-list-detail">{String(item)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function RouteComponent() {
  const client = useQueryClient()
  const [mode, setMode] = useState<AgentMode>('planning')
  const [range, setRange] = useState(() => getWindowRange(7))
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null)
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<Pick<LlmSettings, 'model' | 'reasoning_effort'> | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const quoteQuery = useQuery({
    queryKey: ['daily-quote'],
    queryFn: loadDailyQuote,
  })
  const draftsQuery = useQuery({
    queryKey: ['assistant-drafts'],
    queryFn: listDrafts,
  })
  const sessionsQuery = useQuery({
    queryKey: ['assistant-sessions'],
    queryFn: listChatSessions,
  })
  const settingsQuery = useQuery({
    queryKey: ['agent-settings'],
    queryFn: loadLlmSettings,
  })

  const drafts = draftsQuery.data?.items ?? []
  const selectedDraft = drafts.find((draft) => draft.id === (selectedDraftId ?? drafts[0]?.id)) ?? drafts[0] ?? null
  const sessions = sessionsQuery.data?.items ?? []
  const resolvedConversationId = selectedConversationId ?? sessionIdOf((sessions[0] ?? {}) as Record<string, unknown>)
  const conversationQuery = useQuery({
    queryKey: ['assistant-conversation', resolvedConversationId],
    queryFn: () => loadChatSession(resolvedConversationId as number),
    enabled: resolvedConversationId !== null && mode === 'chat',
  })

  const currentSettings = settingsDraft ?? {
    model: settingsQuery.data?.settings.model ?? 'gpt-5.4',
    reasoning_effort: settingsQuery.data?.settings.reasoning_effort ?? 'medium',
  }
  const aiEnabled = settingsQuery.data?.settings.enabled ?? false
  const managedByEnvironment = settingsQuery.data?.settings.managed_by_environment ?? false

  const refreshAgent = async () => {
    await client.invalidateQueries({ queryKey: ['assistant-drafts'] })
    await client.invalidateQueries({ queryKey: ['assistant-sessions'] })
    await client.invalidateQueries({ queryKey: ['agent-settings'] })
    if (resolvedConversationId) {
      await client.invalidateQueries({ queryKey: ['assistant-conversation', resolvedConversationId] })
    }
  }

  const savePreferencesMutation = useMutation({
    mutationFn: saveLlmSettings,
    onSuccess: async () => {
      setFeedback('Agent preferences saved.')
      setSettingsDraft(null)
      await refreshAgent()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const planMutation = useMutation({
    mutationFn: planDraft,
    onSuccess: async ({ item }) => {
      setFeedback('Planning draft created.')
      setSelectedDraftId(item.id)
      await refreshAgent()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const analyzeMutation = useMutation({
    mutationFn: analyzeDraft,
    onSuccess: async ({ item }) => {
      setFeedback('Analysis draft created.')
      setSelectedDraftId(item.id)
      await refreshAgent()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const applyDraftMutation = useMutation({
    mutationFn: applyDraft,
    onSuccess: async () => {
      setFeedback('Draft applied to the workspace.')
      await refreshAgent()
      await client.invalidateQueries({ queryKey: ['workspace-overview'] })
      await client.invalidateQueries({ queryKey: ['analytics'] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const sendChatMutation = useMutation({
    mutationFn: sendChat,
    onSuccess: async ({ item }) => {
      setMessage('')
      const nextId = sessionIdOf(item.conversation as Record<string, unknown>)
      if (nextId) {
        setSelectedConversationId(nextId)
      }
      setFeedback('Agent reply received.')
      await refreshAgent()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const deleteSessionMutation = useMutation({
    mutationFn: deleteChatSession,
    onSuccess: async () => {
      setSelectedConversationId(null)
      setFeedback('Conversation deleted.')
      await refreshAgent()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const currentMessages = conversationQuery.data?.item.messages ?? []
  const quote = quoteQuery.data?.item

  return (
    <div className="agent-page grid gap-8">
      <ScrollReveal>
        <section className="agent-command-stage">
          <aside className="agent-command-rail">
            <div className="agent-command-copy">
              <p className="eyebrow text-white/56">Agent</p>
              <h1 className="agent-command-title text-white">
                Plan,
                <br />
                review,
                <br />
                and talk in one lane.
              </h1>
              <p className="agent-command-note">
                Bring back the v1 draft-first Agent flow, then keep it closer to the new desk: one mode for planning, one mode for open conversation.
              </p>
            </div>

            <div className="agent-mode-stack">
              <button type="button" className={`agent-mode-pill ${mode === 'planning' ? 'is-active' : ''}`} onClick={() => setMode('planning')}>
                Planning
              </button>
              <button type="button" className={`agent-mode-pill ${mode === 'chat' ? 'is-active' : ''}`} onClick={() => setMode('chat')}>
                Chat
              </button>
            </div>

            <div className="agent-quote-card">
              <p className="eyebrow">Daily quote</p>
              <p className="agent-quote-copy">{quote ? `“${quote.quote}”` : 'Open the week calmly, then let the next move become obvious.'}</p>
              <p className="agent-quote-meta">{quote ? `${quote.author} · ${quote.source}` : 'Fallback memo'}</p>
            </div>
          </aside>

          <div className="agent-command-main">
            <div className="agent-command-toolbar">
              <div>
                <p className="eyebrow">Session controls</p>
                <p className="agent-toolbar-title">Model and reasoning live here, like v1.</p>
              </div>
              <div className="agent-toolbar-grid">
                <label className="grid gap-2 text-sm text-white/70">
                  Model
                  <Select
                    value={currentSettings.model ?? 'gpt-5.4'}
                    onChange={(event) =>
                      setSettingsDraft({
                        ...currentSettings,
                        model: event.target.value,
                      })
                    }
                    className="agent-dark-field"
                  >
                    {modelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-2 text-sm text-white/70">
                  Reasoning
                  <Select
                    value={currentSettings.reasoning_effort ?? 'medium'}
                    onChange={(event) =>
                      setSettingsDraft({
                        ...currentSettings,
                        reasoning_effort: event.target.value,
                      })
                    }
                    className="agent-dark-field"
                  >
                    {reasoningOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </label>
                <Button
                  variant="secondary"
                  className="self-end"
                  onClick={() =>
                    savePreferencesMutation.mutate({
                      model: currentSettings.model ?? null,
                      reasoning_effort: currentSettings.reasoning_effort ?? null,
                    })
                  }
                  disabled={savePreferencesMutation.isPending}
                >
                  Save agent prefs
                </Button>
              </div>
            </div>

            <div className="agent-status-strip">
              <span>{aiEnabled ? 'Agent ready' : 'Agent is offline on this deployment'}</span>
              <span>{managedByEnvironment ? 'Connection managed by environment' : 'Connection can be edited in Settings'}</span>
              <span>{drafts.length} drafts · {sessions.length} chat threads</span>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {draftsQuery.error ? <InlineMessage tone="danger">{describeError(draftsQuery.error)}</InlineMessage> : null}
      {settingsQuery.error ? <InlineMessage tone="danger">{describeError(settingsQuery.error)}</InlineMessage> : null}

      <ScrollReveal delayMs={90}>
        <section className="agent-workbench">
          {mode === 'planning' ? (
            <>
              <Panel className="agent-thread-panel">
                <div className="agent-panel-head">
                  <div>
                    <p className="eyebrow">Planning thread</p>
                    <h2 className="agent-panel-title">Draft first, then apply.</h2>
                  </div>
                  <div className="agent-range-grid">
                    <Input type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} />
                    <Input type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} />
                  </div>
                </div>

                <div className="agent-thread-surface">
                  {selectedDraft ? (
                    <DraftPreview draft={selectedDraft} />
                  ) : (
                    <EmptyState
                      title="No draft generated yet"
                      description="Ask Agent for a weekly plan, a review pass, or a rebalance. New drafts stay reviewable here before they touch tasks or calendar."
                    />
                  )}
                </div>

                <div className="agent-composer">
                  <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                    Instruction
                    <Textarea
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      placeholder="Plan my next two days around overdue math tasks, one English reading block, and the exam revision I keep postponing."
                    />
                  </label>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() =>
                        planMutation.mutate({
                          start: range.start,
                          end: range.end,
                          instruction,
                        })
                      }
                      disabled={planMutation.isPending || !aiEnabled}
                    >
                      Generate plan
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        analyzeMutation.mutate({
                          start: range.start,
                          end: range.end,
                          instruction,
                        })
                      }
                      disabled={analyzeMutation.isPending || !aiEnabled}
                    >
                      Generate review
                    </Button>
                  </div>
                </div>
              </Panel>

              <Panel className="agent-sidebar-panel">
                <div className="agent-panel-head">
                  <div>
                    <p className="eyebrow">Draft shelf</p>
                    <h2 className="agent-panel-title">Recent planning outputs</h2>
                  </div>
                </div>

                {drafts.length === 0 ? (
                  <EmptyState title="No drafts yet" description="Generated plan and analysis drafts will appear here with apply controls and status tags." />
                ) : (
                  <div className="agent-sidebar-list">
                    {drafts.map((draft) => {
                      const counts = draftCounts(draft)
                      return (
                        <button
                          key={draft.id}
                          type="button"
                          onClick={() => setSelectedDraftId(draft.id)}
                          className={`agent-sidebar-card ${selectedDraft?.id === draft.id ? 'is-active' : ''}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="agent-chip">{draft.kind}</span>
                            <span className="agent-chip">{draft.status}</span>
                          </div>
                          <p className="agent-sidebar-card-title">
                            {counts.tasks} tasks · {counts.events} blocks
                          </p>
                          <p className="agent-sidebar-card-copy">{typeof (draft.payload as Record<string, unknown>).summary === 'string' ? String((draft.payload as Record<string, unknown>).summary) : 'Open this draft to inspect the full output.'}</p>
                          {draft.kind === 'plan' && draft.status === 'pending' ? (
                            <Button
                              size="sm"
                              className="mt-2"
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                applyDraftMutation.mutate(draft.id)
                              }}
                            >
                              Apply draft
                            </Button>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </>
          ) : (
            <>
              <Panel className="agent-thread-panel">
                <div className="agent-panel-head">
                  <div>
                    <p className="eyebrow">Chat thread</p>
                    <h2 className="agent-panel-title">{resolvedConversationId ? 'Continue the current conversation.' : 'Start a new chat.'}</h2>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" onClick={() => setSelectedConversationId(null)}>
                      New chat
                    </Button>
                    {resolvedConversationId ? (
                      <Button variant="ghost" onClick={() => deleteSessionMutation.mutate(resolvedConversationId)}>
                        Delete chat
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="agent-thread-surface">
                  {currentMessages.length === 0 ? (
                    <EmptyState title="No messages yet" description="Use chat mode when you want a looser back-and-forth before you decide to formalize it into tasks or schedule blocks." />
                  ) : (
                    <div className="agent-message-stack">
                      {currentMessages.map((messageItem) => (
                        <div
                          key={`${messageItem.role}-${messageItem.id ?? messageItem.content.slice(0, 24)}`}
                          className={`agent-message-bubble ${messageItem.role === 'assistant' ? 'is-assistant' : 'is-user'}`}
                        >
                          <p className="eyebrow">{messageItem.role}</p>
                          <p className="agent-note-copy whitespace-pre-wrap">{messageItem.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="agent-composer">
                  <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                    Message
                    <Textarea
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      placeholder="Ask for a calmer sequence, a reset, a prioritization pass, or a plain-language explanation of what to tackle first."
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() =>
                        sendChatMutation.mutate({
                          conversation_id: resolvedConversationId,
                          message,
                        })
                      }
                      disabled={sendChatMutation.isPending || !message.trim() || !aiEnabled}
                    >
                      Send message
                    </Button>
                  </div>
                </div>
              </Panel>

              <Panel className="agent-sidebar-panel">
                <div className="agent-panel-head">
                  <div>
                    <p className="eyebrow">History</p>
                    <h2 className="agent-panel-title">Saved conversations</h2>
                  </div>
                </div>

                {sessions.length === 0 ? (
                  <EmptyState title="No conversations yet" description="The first chat will open a persistent thread here so you can come back to it later." />
                ) : (
                  <div className="agent-sidebar-list">
                    {sessions.map((session) => {
                      const sessionRecord = session as Record<string, unknown>
                      const sessionId = sessionIdOf(sessionRecord)
                      return (
                        <button
                          key={sessionId ?? sessionTitleOf(sessionRecord)}
                          type="button"
                          onClick={() => {
                            if (sessionId) {
                              setSelectedConversationId(sessionId)
                            }
                          }}
                          className={`agent-sidebar-card ${resolvedConversationId === sessionId ? 'is-active' : ''}`}
                        >
                          <span className="agent-chip">Chat</span>
                          <p className="agent-sidebar-card-title">{sessionTitleOf(sessionRecord)}</p>
                          <p className="agent-sidebar-card-copy">Session #{sessionId ?? 'new'}</p>
                        </button>
                      )
                    })}
                  </div>
                )}
              </Panel>
            </>
          )}
        </section>
      </ScrollReveal>
    </div>
  )
}
