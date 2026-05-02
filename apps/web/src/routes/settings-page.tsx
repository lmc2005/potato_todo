import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { clearBackup, exportBackup, importBackup, loadLlmSettings, loadPomodoroSettings, saveLlmSettings, savePomodoroSettings } from '@/features/settings/api'
import { DialogPanel } from '@/shared/components/dialog-panel'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, MetricCard, PageHeader, Panel, SectionHeading } from '@/shared/components/ui'
import { describeError } from '@/shared/lib/errors'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function RouteComponent() {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [assistantDraft, setAssistantDraft] = useState<{
    baseUrl: string
    apiKey: string
    model: string
    reasoningEffort: string
  } | null>(null)
  const [pomodoroDraft, setPomodoroDraft] = useState<{
    focusMinutes: string
    shortBreakMinutes: string
    longBreakMinutes: string
    totalRounds: string
  } | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [clearOpen, setClearOpen] = useState(false)

  const assistantQuery = useQuery({
    queryKey: ['llm-settings'],
    queryFn: loadLlmSettings,
  })

  const pomodoroQuery = useQuery({
    queryKey: ['settings-pomodoro'],
    queryFn: loadPomodoroSettings,
  })

  const saveAssistantMutation = useMutation({
    mutationFn: saveLlmSettings,
    onSuccess: () => setFeedback('Assistant setup saved.'),
    onError: (error) => setFeedback(describeError(error)),
  })

  const savePomodoroMutation = useMutation({
    mutationFn: savePomodoroSettings,
    onSuccess: () => setFeedback('Focus rhythm saved.'),
    onError: (error) => setFeedback(describeError(error)),
  })

  const exportBackupMutation = useMutation({
    mutationFn: exportBackup,
    onSuccess: async (response) => {
      const blob = await response.blob()
      const filename = response.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? 'potato-todo-backup.json'
      triggerDownload(blob, filename)
      setFeedback('Backup exported.')
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const importBackupMutation = useMutation({
    mutationFn: importBackup,
    onSuccess: () => {
      setImportFile(null)
      setFeedback('Backup imported.')
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const clearBackupMutation = useMutation({
    mutationFn: clearBackup,
    onSuccess: () => {
      setFeedback('All user data cleared after backup snapshot.')
      setClearOpen(false)
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const assistantSettings = assistantQuery.data?.settings
  const currentAssistant = assistantDraft ?? {
    baseUrl: assistantSettings?.base_url ?? '',
    apiKey: assistantSettings?.api_key ?? '',
    model: assistantSettings?.model ?? '',
    reasoningEffort: assistantSettings?.reasoning_effort ?? '',
  }
  const pomodoroSettings = pomodoroQuery.data?.settings
  const currentPomodoro = pomodoroDraft ?? {
    focusMinutes: String(pomodoroSettings?.focus_minutes ?? 25),
    shortBreakMinutes: String(pomodoroSettings?.short_break_minutes ?? 5),
    longBreakMinutes: String(pomodoroSettings?.long_break_minutes ?? 15),
    totalRounds: String(pomodoroSettings?.total_rounds ?? 4),
  }

  return (
    <div className="grid gap-8">
      <ScrollReveal>
        <PageHeader
          eyebrow="Settings"
          title="Keep your desk personal, portable, and recoverable."
          description="Adjust assistant behavior, focus defaults, and data safety without crowding the main workspace."
        />
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {assistantQuery.error ? <InlineMessage tone="danger">{describeError(assistantQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Assistant" value={currentAssistant.model || 'Default'} hint="Your preferred endpoint, key, and model profile." />
        <MetricCard label="Focus rhythm" value={`${currentPomodoro.focusMinutes}/${currentPomodoro.shortBreakMinutes}`} hint="Minutes for focus and short break by default." />
        <MetricCard label="Backups" value="Ready" hint="Export, import, and clear controls stay grouped here." />
      </section>
      </ScrollReveal>

      <ScrollReveal delayMs={100}>
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel className="space-y-5">
          <SectionHeading title="Assistant setup" description="Keep your preferred assistant connection and default focus rhythm in one place." />

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              saveAssistantMutation.mutate({
                base_url: currentAssistant.baseUrl || null,
                api_key: currentAssistant.apiKey || null,
                model: currentAssistant.model || null,
                reasoning_effort: currentAssistant.reasoningEffort || null,
              })
            }}
          >
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Assistant endpoint
              <Input
                value={currentAssistant.baseUrl}
                onChange={(event) =>
                  setAssistantDraft({
                    ...currentAssistant,
                    baseUrl: event.target.value,
                  })
                }
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Access key
              <Input
                value={currentAssistant.apiKey}
                onChange={(event) =>
                  setAssistantDraft({
                    ...currentAssistant,
                    apiKey: event.target.value,
                  })
                }
                placeholder="Leave unchanged if you already saved one"
              />
            </label>
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Model profile
              <Input
                value={currentAssistant.model}
                onChange={(event) =>
                  setAssistantDraft({
                    ...currentAssistant,
                    model: event.target.value,
                  })
                }
                placeholder="Choose the profile you prefer to plan with"
              />
            </label>
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Thinking depth
              <Input
                value={currentAssistant.reasoningEffort}
                onChange={(event) =>
                  setAssistantDraft({
                    ...currentAssistant,
                    reasoningEffort: event.target.value,
                  })
                }
                placeholder="none, low, medium, high, xhigh"
              />
            </label>
            <Button type="submit" disabled={saveAssistantMutation.isPending}>
              Save assistant setup
            </Button>
          </form>

          <div className="soft-divider" />

          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              savePomodoroMutation.mutate({
                focus_minutes: Number(currentPomodoro.focusMinutes),
                short_break_minutes: Number(currentPomodoro.shortBreakMinutes),
                long_break_minutes: Number(currentPomodoro.longBreakMinutes),
                total_rounds: Number(currentPomodoro.totalRounds),
              })
            }}
          >
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Focus minutes
              <Input
                type="number"
                min={1}
                value={currentPomodoro.focusMinutes}
                onChange={(event) =>
                  setPomodoroDraft({
                    ...currentPomodoro,
                    focusMinutes: event.target.value,
                  })
                }
              />
            </label>
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Short break
              <Input
                type="number"
                min={1}
                value={currentPomodoro.shortBreakMinutes}
                onChange={(event) =>
                  setPomodoroDraft({
                    ...currentPomodoro,
                    shortBreakMinutes: event.target.value,
                  })
                }
              />
            </label>
            <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
              Long break
              <Input
                type="number"
                min={1}
                value={currentPomodoro.longBreakMinutes}
                onChange={(event) =>
                  setPomodoroDraft({
                    ...currentPomodoro,
                    longBreakMinutes: event.target.value,
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
                value={currentPomodoro.totalRounds}
                onChange={(event) =>
                  setPomodoroDraft({
                    ...currentPomodoro,
                    totalRounds: event.target.value,
                  })
                }
              />
            </label>
            <Button type="submit" className="md:col-span-2" disabled={savePomodoroMutation.isPending}>
              Save focus rhythm
            </Button>
          </form>
        </Panel>

        <Panel className="space-y-5">
          <SectionHeading title="Data maintenance" description="Download a backup, restore one, or reset the workspace when you intentionally need a clean slate." />

          <div className="grid gap-3">
            <Button variant="secondary" onClick={() => exportBackupMutation.mutate()} disabled={exportBackupMutation.isPending}>
              Export backup
            </Button>

            <div className="surface-subtle grid gap-3 p-4">
              <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                Import backup JSON
                <Input type="file" accept="application/json" onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} />
              </label>
              <Button
                onClick={() => {
                  if (!importFile) {
                    setFeedback('Choose a backup file first.')
                    return
                  }
                  importBackupMutation.mutate(importFile)
                }}
                disabled={importBackupMutation.isPending}
              >
                Import selected file
              </Button>
            </div>

            <DialogPanel
              open={clearOpen}
              onOpenChange={setClearOpen}
              trigger={<Button variant="danger">Clear all user data</Button>}
              title="Confirm destructive clear"
              description="A backup snapshot is saved before the clear runs, but the active workspace for this account will still be wiped."
              footer={
                <Button variant="danger" onClick={() => clearBackupMutation.mutate()} disabled={clearBackupMutation.isPending}>
                  Confirm clear
                </Button>
              }
            >
              <EmptyState
                title="High-impact action"
                description="Use this when you are intentionally resetting the workspace, testing import behavior, or preparing a fresh start."
              />
            </DialogPanel>
          </div>
        </Panel>
      </section>
      </ScrollReveal>
    </div>
  )
}
