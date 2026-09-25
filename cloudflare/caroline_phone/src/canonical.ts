export type CallDirection = 'inbound' | 'outbound'
export type DynamicValue = string | number | boolean

export function buildCallStartVariables(callContextId: string): Record<string, DynamicValue> {
  return {
    call_context_id: callContextId,
  }
}
