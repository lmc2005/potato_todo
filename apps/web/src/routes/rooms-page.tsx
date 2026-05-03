import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useAuth } from '@/features/auth/auth-provider'
import { closeRoom, createRoom, getRoomDetail, getRoomSnapshot, joinRoom, kickRoomMember, leaveRoom, listRooms, resetRoomCode } from '@/features/rooms/api'
import { ScrollReveal } from '@/shared/components/scroll-reveal'
import { Button, EmptyState, InlineMessage, Input } from '@/shared/components/ui'
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
      setActiveRoomId(null)
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
    <div className="rooms-page grid gap-8">
      <ScrollReveal>
        <section className="rooms-hero">
          <div className="rooms-hero-copy">
            <p className="eyebrow text-white/56">Rooms</p>
            <h1 className="rooms-hero-title">
              Study together,
              <br />
              keep the room
              <br />
              <span className="gradient-heading">quiet and live.</span>
            </h1>
            <p className="rooms-hero-note">
              Create a room, share a code, and watch the group pulse through focus time instead of clutter.
            </p>

            <div className="rooms-chip-row">
              <span className="rooms-chip">{rooms.length} open rooms</span>
              <span className="rooms-chip">{snapshot?.active_focus_count ?? 0} focusing now</span>
              <span className="rooms-chip">{detail?.role ?? 'Guest'} access</span>
            </div>
          </div>

          <div className="rooms-hero-status">
            <p className="eyebrow">Active room</p>
            <p className="rooms-status-title">{detail?.name ?? 'Choose or create a room'}</p>
            <p className="rooms-status-copy">
              {detail
                ? `Code ${detail.join_code} · ${snapshot?.member_count ?? detail.member_count} members · Updated ${formatShortDate(detail.updated_at)}`
                : 'The selected room will show its code, member count, and live status here.'}
            </p>
          </div>
        </section>
      </ScrollReveal>

      {feedback ? <InlineMessage tone={feedback.toLowerCase().includes('error') || feedback.toLowerCase().includes('failed') ? 'danger' : 'success'}>{feedback}</InlineMessage> : null}
      {roomsQuery.error ? <InlineMessage tone="danger">{describeError(roomsQuery.error)}</InlineMessage> : null}
      {roomDetailQuery.error ? <InlineMessage tone="danger">{describeError(roomDetailQuery.error)}</InlineMessage> : null}
      {roomSnapshotQuery.error ? <InlineMessage tone="danger">{describeError(roomSnapshotQuery.error)}</InlineMessage> : null}

      <ScrollReveal soft>
        <section className="rooms-layout">
          <div className="rooms-lobby-column">
            <article className="rooms-form-card">
              <div className="rooms-section-head">
                <div>
                  <p className="eyebrow">Create</p>
                  <h2 className="rooms-section-title">Open a new study room.</h2>
                </div>
              </div>

              <form
                className="grid gap-3"
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
            </article>

            <article className="rooms-form-card">
              <div className="rooms-section-head">
                <div>
                  <p className="eyebrow">Join</p>
                  <h2 className="rooms-section-title">Step into an existing room.</h2>
                </div>
              </div>

              <form
                className="grid gap-3"
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
            </article>

            <article className="rooms-list-card">
              <div className="rooms-section-head">
                <div>
                  <p className="eyebrow">Lobby</p>
                  <h2 className="rooms-section-title">Switch between live rooms.</h2>
                </div>
              </div>

              {rooms.length === 0 ? (
                <EmptyState title="No active rooms yet" description="Create a room when you want a shared space for focus sessions, accountability, and daily progress." />
              ) : (
                <div className="rooms-room-list">
                  {rooms.map((room) => (
                    <button
                      key={room.room_id}
                      type="button"
                      onClick={() => setActiveRoomId(room.room_id)}
                      className={`rooms-room-card ${resolvedRoomId === room.room_id ? 'is-active' : ''}`}
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
            </article>
          </div>

          <article className="rooms-live-stage">
            <div className="rooms-section-head">
              <div>
                <p className="eyebrow">Live room view</p>
                <h2 className="rooms-section-title">Member pulse and live study state.</h2>
              </div>
            </div>

            {!detail || !snapshot ? (
              <EmptyState title="Select a room" description="Pick a room from the lobby to open its live member view and shared study momentum." />
            ) : (
              <div className="grid gap-4">
                <div className="rooms-live-header">
                  <div className="space-y-2">
                    <p className="eyebrow">Active room</p>
                    <h2 className="rooms-live-title">{detail.name}</h2>
                    <p className="rooms-live-copy">
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

                <div className="rooms-stat-grid">
                  <div className="rooms-stat-card">
                    <p className="eyebrow">Members</p>
                    <p className="rooms-stat-value">{String(snapshot.member_count)}</p>
                    <p className="rooms-stat-copy">{snapshot.active_focus_count} currently focusing</p>
                  </div>
                  <div className="rooms-stat-card">
                    <p className="eyebrow">Timezone</p>
                    <p className="rooms-stat-value">{snapshot.room.timezone}</p>
                    <p className="rooms-stat-copy">Room date {snapshot.room.today}</p>
                  </div>
                  <div className="rooms-stat-card">
                    <p className="eyebrow">Your place</p>
                    <p className="rooms-stat-value">{detail.role}</p>
                    <p className="rooms-stat-copy">{detail.membership_status}</p>
                  </div>
                </div>

                <div className="grid gap-3">
                  {snapshot.members.map((member) => (
                    <div key={member.user_id} className="room-member-card">
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
          </article>
        </section>
      </ScrollReveal>
    </div>
  )
}
