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
  call_answering_status: 'canonical_pending',
  call_answering_reason: '',
  call_reentry_notice_pending: 'false',
  outbound_authorization_status: 'not_authorized',
  bio_short: '',
  extended_bio: '',
  caroline_persona_facts: '',
  integration__telegram_chat_id: '',
} as const

export type CarolineDynamicVariableName = keyof typeof SAFE_DEFAULTS
export type PhoneRole = 'owner' | 'external' | 'unknown'

export interface InitRequestContext {
  interaction_mode?: unknown
  outbound_call?: unknown
}

interface ToolPolicy {
  owner: string[]
  external: string[]
  unknown: string[]
  outbound: string[]
  hold: string[]
  calendar_read: string[]
  reentry: string[]
}

export interface RuntimeInitSource {
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

function emptyToolPolicy(): ToolPolicy {
  return { owner: [], external: [], unknown: [], outbound: [], hold: [], calendar_read: [], reentry: [] }
}

function parseToolList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 160)) return null
  return [...new Set(value as string[])].slice(0, 64)
}

function parseToolPolicy(raw: string | undefined): ToolPolicy {
  const empty = emptyToolPolicy()
  if (!raw) return empty
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!isPlainObject(value)) return empty
    for (const bucket of ['owner', 'external', 'unknown', 'outbound', 'hold', 'calendar_read', 'reentry'] as const) {
      const parsed = parseToolList(value[bucket])
      if (parsed === null) return emptyToolPolicy()
      empty[bucket] = parsed
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

const BLOCKED_FIRST_MESSAGES: Record<string, string> = {
  canonical_pending: "Caroline isn't available to handle this call right now. Please reach Chris another way if needed. Take care.",
  restricted: "This number hasn't been re-authorized for normal Caroline calls yet. Please reach Chris another way if needed. Take care.",
  restricted_by_owner: "This number isn't authorized for normal Caroline calls. Please reach Chris another way if needed. Take care.",
  banned: "This number isn't authorized for normal Caroline calls. Please reach Chris another way if needed. Take care.",
  waitlisted: "This number isn't authorized for normal Caroline calls yet. Please reach Chris another way if needed. Take care.",
}

export function blockedFirstMessage(status: string): string | undefined {
  return BLOCKED_FIRST_MESSAGES[status]
}

function isOutbound(context: InitRequestContext | undefined): boolean {
  if (!context) return false
  return context.outbound_call === true || context.interaction_mode === 'outbound'
}

export function selectPhoneToolIds(
  vars: Record<CarolineDynamicVariableName, string>,
  policy: ToolPolicy,
  context?: InitRequestContext,
): string[] {
  if (vars.call_answering_status !== 'allowed') return []

  const role = roleFromVariables(vars)

  if (isOutbound(context)) {
    if (vars.outbound_authorization_status !== 'owner_authorized') return []
    return [...new Set(policy.outbound)].slice(0, 64)
  }

  // Unverified callers never receive custom tools from deployment config.
  if (role === 'unknown') return []

  const selected = [...policy[role]]
  if (role === 'external') selected.push(...policy.hold)
  if (vars.calendar_share_level !== 'none') selected.push(...policy.calendar_read)
  if (role === 'external' && vars.call_reentry_notice_pending === 'true') selected.push(...policy.reentry)

  return [...new Set(selected)].slice(0, 64)
}

export function toolIdsForInit(
  env: Env,
  vars: Record<CarolineDynamicVariableName, string>,
  context?: InitRequestContext,
): string[] {
  return selectPhoneToolIds(vars, parseToolPolicy(env.PHONE_TOOL_POLICY_JSON), context)
}

export function buildElevenLabsInitResponse(
  sourceBody: unknown,
  env: Env,
  context?: InitRequestContext,
): Record<string, unknown> | null {
  if (!isPlainObject(sourceBody) || sourceBody.schema_version !== '1') return null

  const dynamicVariables = normalizeDynamicVariables(sourceBody.dynamic_variables)
  const toolIds = toolIdsForInit(env, dynamicVariables, context)
  const firstMessage = blockedFirstMessage(dynamicVariables.call_answering_status)
    ?? safeFirstMessage(sourceBody.first_message)

  const response: Record<string, unknown> = {
    type: 'conversation_initiation_client_data',
    dynamic_variables: dynamicVariables,
    conversation_config_override: {
      agent: {
        prompt: { tool_ids: toolIds },
        ...(firstMessage ? { first_message: firstMessage } : {}),
      },
    },
  }

  if (new TextEncoder().encode(JSON.stringify(response)).byteLength > INIT_RESPONSE_MAX_BYTES) return null
  return response
}
