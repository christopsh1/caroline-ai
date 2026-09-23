import assert from 'node:assert/strict'
import test from 'node:test'
import { buildElevenLabsInitResponse, normalizeDynamicVariables, toolIdsForInit } from '../src/lib/init-contract.ts'

const policy = JSON.stringify({ owner:['owner-tool'], external:['external-tool'], unknown:['unsafe-unknown-tool'], outbound:['outbound-tool'], hold:['hold-tool'], calendar_read:['calendar-tool'], reentry:['reentry-tool'] })

test('canonical-pending init always receives zero custom tools and a fixed safe first message', () => {
  const body = buildElevenLabsInitResponse({ schema_version:'1', dynamic_variables:{ call_answering_status:'canonical_pending' }, first_message:'unsafe backend text' }, { PHONE_TOOL_POLICY_JSON: policy }) as any
  assert.deepEqual(body.conversation_config_override.agent.prompt.tool_ids, [])
  assert.match(body.conversation_config_override.agent.first_message, /isn't available/)
})

test('unverified caller cannot gain custom tools from deployment config', () => {
  const vars = normalizeDynamicVariables({ call_answering_status:'allowed', caller_identity_status:'unknown' })
  assert.deepEqual(toolIdsForInit({ PHONE_TOOL_POLICY_JSON: policy }, vars), [])
})

test('outbound tools require explicit canonical owner authorization marker', () => {
  const denied = normalizeDynamicVariables({ call_answering_status:'allowed', caller_identity_status:'verified_contact', outbound_authorization_status:'not_authorized' })
  const allowed = normalizeDynamicVariables({ call_answering_status:'allowed', caller_identity_status:'verified_contact', outbound_authorization_status:'owner_authorized' })
  assert.deepEqual(toolIdsForInit({ PHONE_TOOL_POLICY_JSON: policy }, denied, { interaction_mode:'outbound' }), [])
  assert.deepEqual(toolIdsForInit({ PHONE_TOOL_POLICY_JSON: policy }, allowed, { interaction_mode:'outbound' }), ['outbound-tool'])
})
