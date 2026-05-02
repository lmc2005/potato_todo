import type {
  ActionResult,
  ApiItem,
  ApiList,
  RoomDetail,
  RoomListItem,
  RoomSnapshot,
} from '@potato/contracts'

import { apiRequest } from '@/shared/lib/api'

export type CreateRoomInput = {
  name: string
  member_limit: number
  timezone: string
}

export type JoinRoomInput = {
  join_code: string
}

export function listRooms() {
  return apiRequest<ApiList<RoomListItem>>('/api/v2/rooms')
}

export function createRoom(payload: CreateRoomInput) {
  return apiRequest<ApiItem<RoomDetail>>('/api/v2/rooms', {
    method: 'POST',
    body: payload,
  })
}

export function joinRoom(payload: JoinRoomInput) {
  return apiRequest<ApiItem<RoomDetail>>('/api/v2/rooms/join', {
    method: 'POST',
    body: payload,
  })
}

export function getRoomDetail(roomId: number) {
  return apiRequest<ApiItem<RoomDetail>>(`/api/v2/rooms/${roomId}`)
}

export function getRoomSnapshot(roomId: number) {
  return apiRequest<ApiItem<RoomSnapshot>>(`/api/v2/rooms/${roomId}/snapshot`)
}

export function leaveRoom(roomId: number) {
  return apiRequest<ActionResult>(`/api/v2/rooms/${roomId}/leave`, {
    method: 'POST',
  })
}

export function resetRoomCode(roomId: number) {
  return apiRequest<ApiItem<RoomDetail>>(`/api/v2/rooms/${roomId}/reset-code`, {
    method: 'POST',
  })
}

export function closeRoom(roomId: number) {
  return apiRequest<ApiItem<RoomDetail>>(`/api/v2/rooms/${roomId}/close`, {
    method: 'POST',
  })
}

export function kickRoomMember(roomId: number, memberUserId: number) {
  return apiRequest<ActionResult>(`/api/v2/rooms/${roomId}/members/${memberUserId}/kick`, {
    method: 'POST',
  })
}
