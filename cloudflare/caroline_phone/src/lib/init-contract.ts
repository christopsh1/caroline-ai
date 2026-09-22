import type { Env } from '../types.ts'

export const INIT_RESPONSE_MAX_BYTES = 256 * 1024

const SAFE_DEFAULTS = {
  caroline_context_json: '',
  caller_access_tier: 'tier_0_unknown_unverified',
  caller_tone_profile: 'professional',
  caller_identity_status: 'unknown',
  caller_relationship_context: '',
  caller_permissions_json: '{}',
  caller_recent_history: '',
  caroline_active_instructions: '',
  availability_status: '',
  calendar_share_level: 'none',
  calendar_current_activity: 'null',
  calendar_next_event: 'null',
  outbound_call_brief_json: '{}',
  caller_persona_profile_json: 'null',
  session_energy: 'neutral',
  call_answering_status: 'allowed',
  call_answering_reason: '',
  call_reentry_notice_pending: 'false',
  bio_short: '',
  extended_bio: '',
  caroline_persona_facts: '',
  integration__telegram_chat_id: '',
} as const

export type CarolineDynamicVariableName = keyof typeof SAFE_DEFAULTS
export type PhoneRole = 'owner' | 'external' | 'unknown'

interface ToolPolicy {
  owner: string[]
  external: string[]
  unknown: string[]
}

export interface CoreInitResponse {
  schema_version?: unknown
  dynamic_variables?: unknown
  first_message?: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeDynamicVariables(value: unknown): Record<CarolineDynamicVariableName, string> {
  const input = isPlainObject(value) ? value : {}
  const output = { ...SAFE_DEFAULTS } as Record<CarolineDynamicVariableName, string>
  for (const key of Object.keys(SAFE_DEFAULTS) as CarolineDynamicVariableName[]) {
    if (typeof input[key] === 'string') output[key] = input[key] as string
  }
  return output
}

export function roleFromVariables(vars: Record<CarolineDynamicVariableName, string>): PhoneRole {
  if (vars.caller_identity_status === 'verified_owner' || vars.caller_access_tier === 'tier_owner') return 'owner'
  if (vars.caller_identity_status.startsWith('verified')) return 'external'
  return 'unknown'
}

function parseToolPolicy(raw: string | undefined): ToolPolicy {
  const empty: ToolPolicy = { owner: [], external: [], unknown: [] }
  if (!raw) return empty
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    for (const role of ['owner', 'external', 'unknown'] as const) {
      const list = value[role]
      if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) return empty
      empty[role] = [...new Set(list as string[])].slice(0, 64)
    }
    return empty
  } catch {
    return empty
  }
}

function safeFirstMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 600 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(trimmed)) return undefined
  return trimmed
}

export function buildElevenLabsInitResponse(coreBody: unknown, env: Env): Record<string, unknown> | null {
  if (!isPlainObject(coreBody)) return null
  if (coreBody.schema_version !== '1') return null

  const dynamicVariables = normalizeDynamicVariables(coreBody.dynamic_variables)
  const role = roleFromVariables(dynamicVariables)
  const policy = parseToolPolicy(env.PHONE_TOOL_POLICY_JSON)
  const firstMessage = safeFirstMessage(coreBody.first_message)

  const response: Record<string, unknown> = {
    type: 'conversation_initiation_client_data',
    dynamic_variables: dynamicVariables,
    conversation_config_override: {
      agent: {
        prompt: { tool_ids: policy[role] },
        ...(firstMessage ? { first_message: firstMessage } : {}),
      },
    },
  }

  if (new TextEncoder().encode(JSON.stringify(response)).byteLength > INIT_RESPONSE_MAX_BYTES) return null
  return response
}
