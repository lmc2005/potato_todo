import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { analyzeDraft, applyDraft, deleteChatSession, listChatSessions, listDrafts, loadChatSession, loadDailyQuote, planDraft, sendChat } from '@/features/planner/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, PageHeader, Panel, SectionHeading, Textarea } from '@/shared/components/ui'
import { getWindowRange } from '@/shared/lib/date'
import { describeError } from '@/shared/lib/errors'

function sessionIdOf(session: Record<string, unknown>) {
  return typeof session.id === 'number' ? session.id : null
}

function sessionTitleOf(session: Record<string, unknown>) {
  return typeof session.title === 'string' && session.title ? session.title : 'Untitled conversation'
}

function prettifyDraftKind(kind: string) {
  return kind.replace(/_/g, ' ')
}

export function RouteComponent() {
  const client = useQueryClient()
  const [range, setRange] = useState(() => getWindowRange(7))
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null)
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
  const drafts = draftsQuery.data?.items ?? []
  const sessions = sessionsQuery.data?.items ?? []
  const resolvedConversationId = selectedConversationId ?? sessionIdOf((sessions[0] ?? {}) as Record<string, unknown>)
  const conversationQuery = useQuery({
    queryKey: ['assistant-conversation', resolvedConversationId],
    queryFn: () => loadChatSession(resolvedConversationId as number),
    enabled: resolvedConversationId !== null,
  })

  const refreshAssistant = async () => {
    await client.invalidateQueries({ queryKey: ['assistant-drafts'] })
    await client.invalidateQueries({ queryKey: ['assistant-sessions'] })
    if (resolvedConversationId) {
      await client.invalidateQueries({ queryKey: ['assistant-conversation', resolvedConversationId] })
    }
  }

  const planMutation = useMutation({
    mutationFn: planDraft,
    onSuccess: async () => {
      setFeedback('Planning draft created.')
      await refreshAssistant()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const analyzeMutation = useMutation({
    mutationFn: analyzeDraft,
    onSuccess: async () => {
      setFeedback('Analysis draft created.')
      await refreshAssistant()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const applyDraftMutation = useMutation({
    mutationFn: applyDraft,
    onSuccess: async () => {
      setFeedback('Draft applied to the workspace.')
      await refreshAssistant()
      await client.invalidateQueries({ queryKey: ['workspace-overview'] })
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
      setFeedback('Assistant reply received.')
      await refreshAssistant()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const deleteSessionMutation = useMutation({
    mutationFn: deleteChatSession,
    onSuccess: async () => {
      setSelectedConversationId(null)
      setFeedback('Conversation deleted.')
      await refreshAssistant()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const currentMessages = conversationQuery.data?.item.messages ?? []
  const quote = quoteQuery.data?.item

  return (
    <div className="grid gap-8">
      <ScrollReveal>
        <PageHeader
          eyebrow="Planner"
          title={
            <>
              <span className="block">Draft the week,</span>
              <span className="block gradient-heading">before it gets loud.</span>
            </>
          }
          description="Capture a planning need, review the draft, and decide what deserves a place in your desk before anything changes."
        />
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {draftsQuery.error ? <InlineMessage tone="danger">{describeError(draftsQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
      <section className="grid gap-4 xl:grid-cols-[1fr_0.92fr]">
        <div className="dark-panel lift-card grid gap-5 p-6 sm:p-7">
          <p className="eyebrow text-white/56">Planning memo</p>
          <div className="space-y-4">
            <p className="display-serif text-[clamp(2.4rem,4vw,3.7rem)] leading-[1.04] tracking-[-0.05em] text-white">
              {quote ? `“${quote.quote}”` : 'Review the week, choose the right move, and keep the desk readable.'}
            </p>
            {quote ? <p className="text-sm text-white/70">{quote.author} · {quote.source}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Drafts</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{drafts.length}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Threads</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{sessions.length}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Window</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">7d</p>
            </div>
          </div>
        </div>

        <div className="surface-panel-strong lift-card grid gap-5 p-6 sm:p-7">
          <p className="eyebrow">Drafts first</p>
          <div className="space-y-3">
            <h2 className="accent-stack-title text-[#1d1d1f]">
              Plan,
              <br />
              <span className="gradient-heading">review, then apply.</span>
            </h2>
            <p className="text-sm leading-7 text-[#6e6e73]">
              Assistant outputs stay reviewable first, so new tasks and calendar blocks only land after you confirm the shape of the week.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-subtle p-4">
              <p className="eyebrow">Date range</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[#1d1d1f]">{range.start} to {range.end}</p>
              <p className="mt-2 text-sm leading-7 text-[#6e6e73]">Set the planning window before generating a new outline or review.</p>
            </div>
            <div className="surface-subtle p-4">
              <p className="eyebrow">Conversation memory</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[#1d1d1f]">{sessions.length > 0 ? 'Ready to resume' : 'Start a thread'}</p>
              <p className="mt-2 text-sm leading-7 text-[#6e6e73]">Keep longer planning threads close instead of scattering context across multiple pages.</p>
            </div>
          </div>
        </div>
      </section>
      </ScrollReveal>

      <ScrollReveal delayMs={90}>
      <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <Panel className="space-y-5">
          <SectionHeading title="Planning studio" description="Choose a time window, describe the need, and generate a reviewable plan or analysis draft." />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Start
              <Input type="date" value={range.start} onChange={(event) => setRange((current) => ({ ...current, start: event.target.value }))} />
            </label>
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              End
              <Input type="date" value={range.end} onChange={(event) => setRange((current) => ({ ...current, end: event.target.value }))} />
            </label>
          </div>

          <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
            Instruction
            <Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Ask for a review sprint, a clearer weekly plan, a rebalance, or a reset." />
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
              disabled={planMutation.isPending}
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
              disabled={analyzeMutation.isPending}
            >
              Generate review
            </Button>
          </div>

          {drafts.length === 0 ? (
            <EmptyState title="No drafts yet" description="Generated plans and reviews will appear here before they touch tasks or calendar blocks." />
          ) : (
            <div className="grid gap-3">
              {drafts.map((draft) => (
                <div key={draft.id} className="surface-subtle grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[rgba(20,27,42,0.08)] px-2.5 py-1 text-xs uppercase tracking-[0.18em] text-[#768090]">{prettifyDraftKind(draft.kind)}</span>
                      <span className="rounded-full border border-[rgba(20,27,42,0.08)] px-2.5 py-1 text-xs text-[#768090]">{draft.status}</span>
                    </div>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[20px] bg-white/72 p-4 text-sm leading-7 text-[#5f6878]">
                      {JSON.stringify(draft.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="flex items-start">
                    <Button size="sm" onClick={() => applyDraftMutation.mutate(draft.id)}>
                      Apply draft
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="space-y-5">
          <SectionHeading title="Conversation feed" description="Keep reflective planning threads close by and revisit past sessions when you need continuity." />

          <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
            <div className="grid gap-3">
              {sessions.length === 0 ? (
                <EmptyState title="No conversations yet" description="Send a message to open the first assistant conversation." />
              ) : (
                sessions.map((session) => {
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
                      className={`surface-subtle p-4 text-left transition-colors ${resolvedConversationId === sessionId ? 'border-[rgba(93,102,255,0.16)] bg-[rgba(93,102,255,0.06)]' : ''}`}
                    >
                      <p className="font-medium text-[#1d1d1f]">{sessionTitleOf(sessionRecord)}</p>
                      <p className="mt-1 text-sm text-[#768090]">Session #{sessionId ?? 'new'}</p>
                    </button>
                  )
                })
              )}
            </div>

            <div className="grid gap-4">
              <div className="surface-subtle max-h-[420px] overflow-auto p-4">
                {currentMessages.length === 0 ? (
                  <p className="text-sm leading-7 text-[#768090]">Conversation history will appear here after your first message.</p>
                ) : (
                  <div className="grid gap-3">
                    {currentMessages.map((messageItem) => (
                      <div key={`${messageItem.role}-${messageItem.id ?? messageItem.content.slice(0, 24)}`} className="rounded-[22px] border border-[rgba(20,27,42,0.08)] bg-white/84 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a8394]">{messageItem.role}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#5f6878]">{messageItem.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                Ask the assistant
                <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask for a study reset, a clearer sequence, or a fresh prioritization pass." />
              </label>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() =>
                    sendChatMutation.mutate({
                      conversation_id: resolvedConversationId,
                      message,
                    })
                  }
                  disabled={sendChatMutation.isPending || !message.trim()}
                >
                  Send message
                </Button>
                {resolvedConversationId ? (
                  <Button variant="ghost" onClick={() => deleteSessionMutation.mutate(resolvedConversationId)}>
                    Delete session
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      </section>
      </ScrollReveal>
    </div>
  )
}
