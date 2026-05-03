import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { clearBackup, exportBackup, importBackup, loadLlmSettings, loadPomodoroSettings, saveLlmSettings, savePomodoroSettings } from '@/features/settings/api'
import { DialogPanel } from '@/shared/components/dialog-panel'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input } from '@/shared/components/ui'
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
  const client = useQueryClient()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [agentConnectionDraft, setAgentConnectionDraft] = useState<{
    baseUrl: string
    apiKey: string
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

  const invalidateOperationalQueries = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['llm-settings'] }),
      client.invalidateQueries({ queryKey: ['settings-pomodoro'] }),
      client.invalidateQueries({ queryKey: ['pomodoro-settings'] }),
      client.invalidateQueries({ queryKey: ['workspace-overview'] }),
      client.invalidateQueries({ queryKey: ['analytics'] }),
      client.invalidateQueries({ queryKey: ['subjects'] }),
      client.invalidateQueries({ queryKey: ['focus-tasks'] }),
      client.invalidateQueries({ queryKey: ['rooms'] }),
    ])
  }

  const saveAssistantMutation = useMutation({
    mutationFn: saveLlmSettings,
    onSuccess: async () => {
      setFeedback('Agent connection saved.')
      setAgentConnectionDraft(null)
      await invalidateOperationalQueries()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const savePomodoroMutation = useMutation({
    mutationFn: savePomodoroSettings,
    onSuccess: async () => {
      setFeedback('Focus rhythm saved.')
      setPomodoroDraft(null)
      await invalidateOperationalQueries()
    },
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
    onSuccess: async () => {
      setImportFile(null)
      setFeedback('Backup imported.')
      await invalidateOperationalQueries()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const clearBackupMutation = useMutation({
    mutationFn: clearBackup,
    onSuccess: async () => {
      setFeedback('All user data cleared after backup snapshot.')
      setClearOpen(false)
      await invalidateOperationalQueries()
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const assistantSettings = assistantQuery.data?.settings
  const currentConnection = agentConnectionDraft ?? {
    baseUrl: assistantSettings?.base_url ?? '',
    apiKey: assistantSettings?.api_key ?? '',
  }
  const pomodoroSettings = pomodoroQuery.data?.settings
  const currentPomodoro = pomodoroDraft ?? {
    focusMinutes: String(pomodoroSettings?.focus_minutes ?? 25),
    shortBreakMinutes: String(pomodoroSettings?.short_break_minutes ?? 5),
    longBreakMinutes: String(pomodoroSettings?.long_break_minutes ?? 15),
    totalRounds: String(pomodoroSettings?.total_rounds ?? 4),
  }

  return (
    <div className="settings-page grid gap-8">
      <ScrollReveal>
        <section className="settings-command-board">
          <div className="settings-command-copy">
            <p className="eyebrow">Settings</p>
            <h1 className="settings-command-title">
              Keep the desk
              <br />
              personal,
              <br />
              <span className="gradient-heading">portable, and safe.</span>
            </h1>
            <p className="settings-command-note">
              Agent connection, focus defaults, and recovery controls stay here. Model choice and reasoning depth now live in the Agent workspace where the planning actually happens.
            </p>
          </div>

          <div className="settings-command-grid">
            <div className="settings-status-card">
              <p className="eyebrow">Agent</p>
              <p className="settings-status-value">{assistantSettings?.enabled ? 'Ready' : 'Offline'}</p>
              <p className="settings-status-copy">
                {assistantSettings?.managed_by_environment ? 'Managed by environment variables.' : 'Editable from this page.'}
              </p>
            </div>
            <div className="settings-status-card">
              <p className="eyebrow">Rhythm</p>
              <p className="settings-status-value">
                {currentPomodoro.focusMinutes}/{currentPomodoro.shortBreakMinutes}
              </p>
              <p className="settings-status-copy">Focus and short-break defaults.</p>
            </div>
            <div className="settings-status-card">
              <p className="eyebrow">Backup</p>
              <p className="settings-status-value">Portable</p>
              <p className="settings-status-copy">Export, import, and clear controls stay together.</p>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {assistantQuery.error ? <InlineMessage tone="danger">{describeError(assistantQuery.error)}</InlineMessage> : null}
      {pomodoroQuery.error ? <InlineMessage tone="danger">{describeError(pomodoroQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
        <section className="settings-operating-grid">
          <article className="settings-panel">
            <div className="settings-panel-head">
              <div>
                <p className="eyebrow">Agent connection</p>
                <h2 className="settings-panel-title">Endpoint and key live here.</h2>
              </div>
            </div>

            <p className="settings-panel-copy">
              This page only manages the connection itself. Model choice and reasoning depth are controlled directly inside Agent so the planning surface stays self-contained.
            </p>

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                saveAssistantMutation.mutate({
                  base_url: currentConnection.baseUrl || null,
                  api_key: currentConnection.apiKey || null,
                })
              }}
            >
              <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                Agent endpoint
                <Input
                  value={currentConnection.baseUrl}
                  disabled={assistantSettings?.managed_by_environment}
                  onChange={(event) =>
                    setAgentConnectionDraft({
                      ...currentConnection,
                      baseUrl: event.target.value,
                    })
                  }
                  placeholder="https://api.example.com/v1"
                />
              </label>
              <label className="grid gap-2 text-sm text-[color:var(--text-soft)]">
                Access key
                <Input
                  value={currentConnection.apiKey}
                  disabled={assistantSettings?.managed_by_environment}
                  onChange={(event) =>
                    setAgentConnectionDraft({
                      ...currentConnection,
                      apiKey: event.target.value,
                    })
                  }
                  placeholder="Leave unchanged if you already saved one"
                />
              </label>
              <Button type="submit" disabled={saveAssistantMutation.isPending || assistantSettings?.managed_by_environment}>
                Save agent connection
              </Button>
            </form>

            {assistantSettings?.managed_by_environment ? (
              <div className="settings-inline-note">
                Environment variables are currently managing the Agent connection, so local edits are intentionally disabled.
              </div>
            ) : null}
          </article>

          <article className="settings-panel">
            <div className="settings-panel-head">
              <div>
                <p className="eyebrow">Pomodoro defaults</p>
                <h2 className="settings-panel-title">Your baseline focus rhythm.</h2>
              </div>
            </div>

            <p className="settings-panel-copy">
              These values seed the Focus page whenever you start a Pomodoro run, and they are stored per user so the rhythm follows the account.
            </p>

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
          </article>
        </section>
      </ScrollReveal>

      <ScrollReveal delayMs={100}>
        <section className="settings-recovery-panel">
          <div className="settings-panel-head">
            <div>
              <p className="eyebrow">Recovery</p>
              <h2 className="settings-panel-title">Backup, restore, or reset the workspace.</h2>
            </div>
          </div>

          <p className="settings-panel-copy">
            Use export before big migrations, import when you need to recover a known state, and clear only when you intentionally want a fresh start.
          </p>

          <div className="settings-recovery-grid">
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
        </section>
      </ScrollReveal>
    </div>
  )
}
