export type AuthUser = {
  id: number
  email: string
}

export type AuthSession = {
  access_token: string
  token_type: "bearer"
  user: AuthUser
}

export type SubjectRecord = {
  id: number
  name: string
  color: string
  daily_goal_minutes: number
  weekly_goal_minutes: number
  monthly_goal_minutes: number
  total_focus_seconds: number
  archived: boolean
}

export type TaskRecord = {
  id: number
  title: string
  subject_id: number | null
  subject: string | null
  subject_color: string
  status: "todo" | "in_progress" | "done" | "undone"
  priority: "low" | "medium" | "high"
  due_at: string | null
  estimated_minutes: number | null
  notes: string | null
  completed_at: string | null
  created_at: string
}

export type CalendarEventRecord = {
  id: number
  title: string
  subject_id: number | null
  task_id: number | null
  start_at: string
  end_at: string
  source: "manual" | "ai"
  notes: string | null
}

export type StatsPayload = {
  start: string
  end: string
  total_seconds: number
  total_minutes: number
  session_count: number
  streak_days: number
  subject_breakdown: Array<{
    subject_id: number
    name: string
    color: string
    seconds: number
    minutes: number
    share: number
  }>
  daily_trend: Array<{
    date: string
    seconds: number
    minutes: number
  }>
  task_completion_trend: Array<{
    date: string
    total: number
    completed: number
    on_time: number
    completion_rate: number | null
    on_time_rate: number | null
  }>
  task_ranking: Array<{
    task_id: number
    title: string
    seconds: number
    minutes: number
  }>
  goal_completion: Array<{
    subject_id: number
    name: string
    minutes: number
    target_minutes: number
    completion: number
  }>
  sessions: Array<{
    id: number
    subject: string
    task: string | null
    mode: "count_up" | "count_down" | "pomodoro"
    started_at: string
    ended_at: string
    focus_seconds: number
    stop_reason: string | null
  }>
}

export type TimerPayload = {
  active?: boolean
  completed?: string | null
  id?: number
  mode?: "count_up" | "count_down" | "pomodoro"
  subject_id?: number
  task_id?: number | null
  schedule_event_id?: number | null
  started_at?: string
  is_paused?: boolean
  elapsed_seconds?: number
  remaining_seconds?: number | null
  countdown_seconds?: number | null
  pomodoro_phase?: string | null
  pomodoro_round?: number
  pomodoro_total_rounds?: number
  session_id?: number | null
  focus_seconds?: number
}

export type RoomListItem = {
  room_id: number
  name: string
  join_code: string
  status: string
  timezone: string
  member_limit: number
  member_count: number
  role: string
  membership_status: string
  joined_at: string
  updated_at: string
}

export type RoomSnapshot = {
  room: {
    id: number
    name: string
    join_code: string
    status: string
    member_limit: number
    timezone: string
    today: string
    owner_user_id: number
    updated_at: string
    is_owner: boolean
  }
  member_count: number
  active_focus_count: number
  members: Array<{
    user_id: number
    label: string
    email: string
    role: string
    joined_at: string
    focus_seconds_today: number
    done_count_today: number
    unfinished_count_today: number
    late_done_count_today: number
    completed_titles_today: string[]
    completed_titles_more: number
    in_progress_titles_today: string[]
    in_progress_titles_more: number
    is_focusing: boolean
    rank: number
  }>
}

export type ApiList<T> = { items: T[] }
export type ApiItem<T> = { item: T }
export type ApiSettings<T> = { settings: T }
export type ApiStats = { stats: StatsPayload }
export type ApiResult<T> = { result: T }

export type LlmSettings = {
  enabled?: boolean
  base_url: string | null
  api_key: string | null
  model: string | null
  reasoning_effort: string | null
  managed_by_environment?: boolean
}

export type PomodoroSettings = {
  focus_minutes: number
  short_break_minutes: number
  long_break_minutes: number
  total_rounds: number
}

export type AssistantDraft = {
  id: number
  kind: string
  status: string
  created_at: string
  payload: Record<string, unknown>
}

export type AssistantConversationSession = {
  id?: number
  title?: string
  updated_at?: string
  created_at?: string
  message_count?: number
  [key: string]: unknown
}

export type AssistantConversationDetail = {
  id?: number
  title?: string
  messages?: Array<{
    id?: number
    role: string
    content: string
    created_at?: string
  }>
  [key: string]: unknown
}

export type AssistantChatResult = {
  conversation: AssistantConversationDetail
  assistant_message: string
  sessions: AssistantConversationSession[]
}

export type DailyQuote = {
  quote: string
  author: string
  source: string
  cached?: boolean
  fallback?: boolean
}

export type RoomDetail = {
  id: number
  name: string
  join_code: string
  status: string
  member_limit: number
  member_count: number
  timezone: string
  owner_user_id: number
  updated_at: string
  role: string
  membership_status: string
  is_owner: boolean
}

export type ActionResult = {
  deleted?: boolean
  detached_tasks?: number
  detached_events?: number
  imported?: boolean
  cleared?: boolean
  left?: boolean
  kicked?: boolean
  ok?: boolean
  [key: string]: unknown
}
