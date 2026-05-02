import { ApiError } from '@/shared/lib/api'

export function describeError(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.payload === 'object' && error.payload && 'detail' in error.payload) {
      return String(error.payload.detail)
    }
    if (typeof error.payload === 'string' && error.payload.trim()) {
      return error.payload
    }
    return `Request failed with status ${error.status}.`
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Unexpected error. Please try again.'
}
