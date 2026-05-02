import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth/auth-provider'
import { closeRoom, createRoom, getRoomDetail, getRoomSnapshot, joinRoom, kickRoomMember, leaveRoom, listRooms, resetRoomCode } from '@/features/rooms/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input, MetricCard, PageHeader, Panel, SectionHeading } from '@/shared/components/ui'
import { formatMinutes, formatShortDate } from '@/shared/lib/date'
import { describeError } from '@/shared/lib/errors'

export function RouteComponent() {
  const auth = useAuth()
  const client = useQueryClient()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [roomName, setRoomName] = useState('')
  const [memberLimit, setMemberLimit] = useState('8')
  const [roomTimezone, setRoomTimezone] = useState('Asia/Shanghai')
  const [joinCode, setJoinCode] = useState('')
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null)

  const roomsQuery = useQuery({
    queryKey: ['rooms'],
    queryFn: listRooms,
  })
  const rooms = roomsQuery.data?.items ?? []
  const resolvedRoomId = activeRoomId ?? rooms[0]?.room_id ?? null

  const roomDetailQuery = useQuery({
    queryKey: ['room-detail', resolvedRoomId],
    queryFn: () => getRoomDetail(resolvedRoomId as number),
    enabled: resolvedRoomId !== null,
  })

  const roomSnapshotQuery = useQuery({
    queryKey: ['room-snapshot', resolvedRoomId],
    queryFn: () => getRoomSnapshot(resolvedRoomId as number),
    enabled: resolvedRoomId !== null,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (!resolvedRoomId || !auth.accessToken) {
      return
    }

    const streamUrl = `/api/v2/rooms/${resolvedRoomId}/stream?access_token=${encodeURIComponent(auth.accessToken)}`
    const eventSource = new EventSource(streamUrl)

    const refreshRoom = () => {
      void client.invalidateQueries({ queryKey: ['rooms'] })
      void client.invalidateQueries({ queryKey: ['room-detail', resolvedRoomId] })
      void client.invalidateQueries({ queryKey: ['room-snapshot', resolvedRoomId] })
    }

    eventSource.addEventListener('room_update', refreshRoom)
    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.removeEventListener('room_update', refreshRoom)
      eventSource.close()
    }
  }, [resolvedRoomId, auth.accessToken, client])

  const createRoomMutation = useMutation({
    mutationFn: createRoom,
    onSuccess: async ({ item }) => {
      setRoomName('')
      setActiveRoomId(item.id)
      setFeedback('Room created.')
      await client.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const joinRoomMutation = useMutation({
    mutationFn: joinRoom,
    onSuccess: async ({ item }) => {
      setJoinCode('')
      setActiveRoomId(item.id)
      setFeedback('Joined room.')
      await client.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const leaveRoomMutation = useMutation({
    mutationFn: leaveRoom,
    onSuccess: async () => {
      setFeedback('Left room.')
      setActiveRoomId(null)
      await client.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const resetCodeMutation = useMutation({
    mutationFn: resetRoomCode,
    onSuccess: async () => {
      setFeedback('Join code updated.')
      await client.invalidateQueries({ queryKey: ['room-detail', resolvedRoomId] })
      await client.invalidateQueries({ queryKey: ['room-snapshot', resolvedRoomId] })
      await client.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const closeRoomMutation = useMutation({
    mutationFn: closeRoom,
    onSuccess: async () => {
      setFeedback('Room closed.')
      await client.invalidateQueries({ queryKey: ['room-detail', resolvedRoomId] })
      await client.invalidateQueries({ queryKey: ['room-snapshot', resolvedRoomId] })
      await client.invalidateQueries({ queryKey: ['rooms'] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const kickMutation = useMutation({
    mutationFn: ({ roomId, memberUserId }: { roomId: number; memberUserId: number }) => kickRoomMember(roomId, memberUserId),
    onSuccess: async () => {
      setFeedback('Member removed from room.')
      await client.invalidateQueries({ queryKey: ['room-snapshot', resolvedRoomId] })
    },
    onError: (error) => setFeedback(describeError(error)),
  })

  const detail = roomDetailQuery.data?.item
  const snapshot = roomSnapshotQuery.data?.item

  return (
    <div className="grid gap-8">
      <ScrollReveal>
        <PageHeader
          eyebrow="Rooms"
          title={
            <>
              <span className="block">Study together,</span>
              <span className="block gradient-heading">without losing the calm.</span>
            </>
          }
          description="Create a room, share a code, and keep the live view focused on people, progress, and gentle momentum."
        />
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {roomsQuery.error ? <InlineMessage tone="danger">{describeError(roomsQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
      <section className="grid gap-4 xl:grid-cols-[0.98fr_1.02fr]">
        <div className="dark-panel lift-card grid gap-5 p-6 sm:p-7">
          <p className="eyebrow text-white/56">Live room</p>
          <div className="space-y-3">
            <p className="display-serif text-[clamp(2.4rem,4vw,3.8rem)] leading-[1.04] tracking-[-0.05em] text-white">
              {detail ? detail.name : 'Open a room and bring the group into view.'}
            </p>
            <p className="text-sm leading-7 text-white/70">
              {snapshot ? `${snapshot.member_count} members inside, ${snapshot.active_focus_count} focusing right now.` : 'Create a room or join by code to see the shared desk come alive.'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Open rooms</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{rooms.length}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Members</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{snapshot?.member_count ?? '--'}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/56">Role</p>
              <p className="mt-5 text-3xl font-semibold tracking-[-0.06em] text-white">{detail?.role ?? 'Guest'}</p>
            </div>
          </div>
        </div>

        <div className="surface-panel-strong lift-card grid gap-5 p-6 sm:p-7">
          <p className="eyebrow">Shared momentum</p>
          <div className="space-y-3">
            <h2 className="accent-stack-title text-[#1d1d1f]">
              Lobby, live view,
              <br />
              <span className="gradient-heading">and one clear pulse.</span>
            </h2>
            <p className="text-sm leading-7 text-[#6e6e73]">
              Keep room entry simple, member context visible, and the active session readable without crowding the page.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-subtle p-4">
              <p className="eyebrow">Join code</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[#1d1d1f]">{detail?.join_code ?? 'No room selected'}</p>
              <p className="mt-2 text-sm leading-7 text-[#6e6e73]">Share a code when you want a quick, lightweight way to bring someone into the room.</p>
            </div>
            <div className="surface-subtle p-4">
              <p className="eyebrow">Your place</p>
              <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[#1d1d1f]">{detail?.membership_status ?? 'Ready to join'}</p>
              <p className="mt-2 text-sm leading-7 text-[#6e6e73]">Owners keep the room moving, members stay focused, and guests can step in without noise.</p>
            </div>
          </div>
        </div>
      </section>
      </ScrollReveal>

      <ScrollReveal delayMs={100}>
      <section className="grid gap-4 xl:grid-cols-[0.94fr_1.06fr]">
        <Panel className="space-y-5">
          <SectionHeading title="Room lobby" description="Create a study room, join by code, and switch the active detail view without leaving the page." />

          <form
            className="surface-subtle grid gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              createRoomMutation.mutate({
                name: roomName,
                member_limit: Number(memberLimit),
                timezone: roomTimezone,
              })
            }}
          >
            <Input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Create a study room" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="number" min={2} max={20} value={memberLimit} onChange={(event) => setMemberLimit(event.target.value)} />
              <Input value={roomTimezone} onChange={(event) => setRoomTimezone(event.target.value)} placeholder="Asia/Shanghai" />
            </div>
            <Button type="submit" disabled={createRoomMutation.isPending}>
              Create room
            </Button>
          </form>

          <form
            className="surface-subtle grid gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              joinRoomMutation.mutate({
                join_code: joinCode,
              })
            }}
          >
            <Input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Join code" required />
            <Button type="submit" variant="secondary" disabled={joinRoomMutation.isPending}>
              Join room
            </Button>
          </form>

          {rooms.length === 0 ? (
            <EmptyState title="No active rooms yet" description="Create a room when you want a shared space for focus sessions, accountability, and daily progress." />
          ) : (
            <div className="grid gap-3">
              {rooms.map((room) => (
                <button
                  key={room.room_id}
                  type="button"
                  onClick={() => setActiveRoomId(room.room_id)}
                  className={`surface-subtle grid gap-2 p-4 text-left transition-colors ${resolvedRoomId === room.room_id ? 'border-[rgba(93,102,255,0.16)] bg-[rgba(93,102,255,0.06)]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[#1d1d1f]">{room.name}</p>
                    <span className="text-xs uppercase tracking-[0.18em] text-[#768090]">{room.status}</span>
                  </div>
                  <p className="text-sm text-[#6e6e73]">
                    Code {room.join_code} · {room.member_count}/{room.member_limit} members · {room.role}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="space-y-5">
          <SectionHeading title="Live room view" description="See the active room, its members, and how the group is moving today." />

          {!detail || !snapshot ? (
            <EmptyState title="Select a room" description="Pick a room from the lobby to open its live member view and shared study momentum." />
          ) : (
            <div className="grid gap-4">
              <div className="surface-panel-strong p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <p className="eyebrow">Active room</p>
                    <h2 className="section-title">{detail.name}</h2>
                    <p className="body-copy text-sm">
                      Join code {detail.join_code} · {snapshot.member_count} members · Updated {formatShortDate(detail.updated_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.is_owner ? (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => resetCodeMutation.mutate(detail.id)}>
                          Refresh code
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => closeRoomMutation.mutate(detail.id)}>
                          Close room
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => leaveRoomMutation.mutate(detail.id)}>
                        Leave room
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard label="Members" value={String(snapshot.member_count)} hint={`${snapshot.active_focus_count} currently focusing`} />
                <MetricCard label="Timezone" value={snapshot.room.timezone} hint={`Room date ${snapshot.room.today}`} />
                <MetricCard label="Your place" value={detail.role} hint={detail.membership_status} />
              </div>

              <div className="grid gap-3">
                {snapshot.members.map((member) => (
                  <div key={member.user_id} className="surface-subtle grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[rgba(20,27,42,0.08)] px-2.5 py-1 text-xs text-[#768090]">Rank #{member.rank}</span>
                        <span className="rounded-full border border-[rgba(20,27,42,0.08)] px-2.5 py-1 text-xs text-[#768090]">{member.role}</span>
                        {member.is_focusing ? <span className="status-pill">Focusing now</span> : null}
                      </div>
                      <div>
                        <p className="font-semibold text-[#1d1d1f]">{member.label}</p>
                        <p className="text-sm text-[#768090]">{member.email}</p>
                      </div>
                      <p className="text-sm text-[#6e6e73]">
                        {formatMinutes(Math.round(member.focus_seconds_today / 60))} focused · {member.done_count_today} done today · {member.unfinished_count_today} unfinished
                      </p>
                    </div>
                    {detail.is_owner && member.user_id !== snapshot.room.owner_user_id ? (
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            kickMutation.mutate({
                              roomId: detail.id,
                              memberUserId: member.user_id,
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </section>
      </ScrollReveal>
    </div>
  )
}
