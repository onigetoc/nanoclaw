import type {
  Session,
  ProvidersResponse,
  Message,
  SendMessageRequest,
  AppError
} from './types'
import { retryRequest, withTimeout } from '../utils/apiHelpers'
import { API_CONFIG } from '../utils/constants'

// Configuration
const API_BASE_URL = API_CONFIG.BASE_URL

// Utility function to create AppError from response
const createAppError = async (response: Response): Promise<AppError> => {
  let errorData: Record<string, unknown> = {}
  
  try {
    errorData = await response.json()
  } catch {
    // If JSON parsing fails, use response text
    errorData = { message: response.statusText }
  }

  const nestedData = (errorData.data && typeof errorData.data === 'object')
    ? (errorData.data as Record<string, unknown>)
    : null
  const validationErrors = Array.isArray(errorData.error) ? errorData.error : []
  const firstValidationError = validationErrors.length > 0 && typeof validationErrors[0] === 'object'
    ? (validationErrors[0] as Record<string, unknown>)
    : null
  const message =
    typeof errorData.message === 'string'
      ? errorData.message
      : typeof nestedData?.message === 'string'
        ? nestedData.message
        : typeof firstValidationError?.message === 'string'
          ? firstValidationError.message
        : `HTTP ${response.status}`
  const error = new Error(message) as AppError
  error.statusCode = response.status
  error.code = typeof errorData.code === 'string' ? errorData.code : undefined
  error.data = errorData
  
  return error
}

// Generic fetch wrapper with error handling, timeout, and retry
const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`
  
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  }

  const makeRequest = async (): Promise<T> => {
    const response = await fetch(url, { ...defaultOptions, ...options })

    if (!response.ok) {
      throw await createAppError(response)
    }

    return response.json()
  }

  // Apply timeout and retry logic
  return retryRequest(() => withTimeout(makeRequest(), API_CONFIG.TIMEOUT))
}

// Session Management
export const createSession = async (): Promise<Session> => {
  return apiRequest<Session>('/session', {
    method: 'POST',
    // opencode server expects JSON payload for POST /session
    body: JSON.stringify({})
  })
}

export const listSessions = async (): Promise<Session[]> => {
  return apiRequest<Session[]>('/session')
}

export const deleteSession = async (sessionId: string): Promise<boolean> => {
  return apiRequest<boolean>(`/session/${sessionId}`, {
    method: 'DELETE'
  })
}

// Provider and Model Management
export const getProviders = async (): Promise<ProvidersResponse> => {
  return apiRequest<ProvidersResponse>('/config/providers')
}

// Message Management
export const sendMessage = async (
  sessionId: string,
  request: SendMessageRequest
): Promise<Message> => {
  const normalizedMessageId = request.messageID.startsWith('msg')
    ? request.messageID
    : `msg_${request.messageID}`

  const normalizedRequest = {
    messageID: normalizedMessageId,
    model: {
      providerID: request.providerID,
      modelID: request.modelID
    },
    // `mode` from UI maps to `agent` in the current opencode API
    agent: request.mode,
    parts: request.parts.map((part) => {
      if (part.type === 'text') {
        return {
          type: 'text' as const,
          text: part.text
        }
      }

      return {
        type: 'file' as const,
        mediaType: part.mime,
        url: part.url
      }
    })
  }

  return apiRequest<Message>(`/session/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify(normalizedRequest)
  })
}

// App Management
export const getAppInfo = async (): Promise<Record<string, unknown>> => {
  return apiRequest<Record<string, unknown>>('/app')
}

export const initializeApp = async (): Promise<boolean> => {
  return apiRequest<boolean>('/app/init', {
    method: 'POST'
  })
}

export const getConfig = async (): Promise<Record<string, unknown>> => {
  return apiRequest<Record<string, unknown>>('/config')
}

// Note: Message creation utilities are now in utils/apiHelpers.ts

// Default export with all API functions
export const api = {
  // Session
  createSession,
  listSessions,
  deleteSession,
  
  // Providers
  getProviders,
  
  // Messages
  sendMessage,
  
  // App
  getAppInfo,
  initializeApp,
  getConfig
}

export default api