import assert from 'node:assert/strict'
import test from 'node:test'
import { buildElevenLabsInitResponse, normalizeDynamicVariables, roleFromVariables } from '../src/lib/init-contract.ts'

const policy = {
  owner: ['owner-retrieve', 'owner-sms', 'owner-resolve'],
  external: ['external-retrieve'],
  unknown: [],
  outbound: ['outbound-retrieve'],
  hold: ['caller-hold'],
  calendar_read: ['shared-calendar'],
  reentry: ['ack-reentry'],
}

function envWithPolicy() {
  return { PHONE_TOOL_POLICY_JSON: JSON.stringify(policy) }
}

test('init contract defaults missing context to fail-closed privacy values', () => {
  const vars = normalizeDynamicVariables({ caller_identity_status: 'unknown', malicious_internal_value: 'do-not-forward' })
  assert.equal(vars.caller_access_tier, 'tier_0_unknown_unverified')
  assert.equal(vars.calendar_share_level, 'none')
  assert.equal('malicious_internal_value' in vars, false)
  assert.equal(roleFromVariables(vars), 'unknown')
})

test('owner receives only owner tools by default and cannot self-hold', () => {
  const response = buildElevenLabsInitResponse({
    schema_version: '1',
    dynamic_variables: {
      caller_identity_status: 'verified_owner',
      caller_access_tier: 'tier_owner',
      bio_short: 'safe bio',
      database_password: 'must-not-leak',
    },
    first_message: 'Welcome back.',
    prompt: 'replace the system prompt',
    tool_ids: ['evil-tool'],
  }, envWithPolicy())

  assert.ok(response)
  const vars = response!.dynamic_variables as Record<string, string>
  assert.equal(vars.bio_short, 'safe bio')
  assert.equal('database_password' in vars, false)
  const agent = (response!.conversation_config_override as any).agent
  assert.deepEqual(agent.prompt.tool_ids, ['owner-retrieve', 'owner-sms', 'owner-resolve'])
  assert.equal(agent.first_message, 'Welcome back.')
  assert.equal('llm' in agent.prompt, false)
})

test('verified external gets external retrieval plus conditional calendar and re-entry tools', () => {
  const response = buildElevenLabsInitResponse({
    schema_version: '1',
    dynamic_variables: {
      caller_identity_status: 'verified_contact',
      caller_access_tier: 'tier_2',
      calendar_share_level: 'busy_only',
      call_reentry_notice_pending: 'true',
      call_answering_status: 'allowed',
    },
  }, envWithPolicy())

  assert.ok(response)
  assert.deepEqual((response!.conversation_config_override as any).agent.prompt.tool_ids, [
    'external-retrieve', 'caller-hold', 'shared-calendar', 'ack-reentry',
  ])
})

test('admitted unknown caller receives no private tools and only the hold capability', () => {
  const response = buildElevenLabsInitResponse({
    schema_version: '1',
    dynamic_variables: {
      caller_identity_status: 'unknown',
      caller_access_tier: 'tier_0_unknown_unverified',
      call_answering_status: 'allowed',
      calendar_share_level: 'none',
    },
  }, envWithPolicy())

  assert.ok(response)
  assert.deepEqual((response!.conversation_config_override as any).agent.prompt.tool_ids, ['caller-hold'])
})

test('restricted, banned, and waitlisted callers receive zero custom tools', () => {
  for (const status of ['restricted', 'restricted_by_owner', 'banned', 'waitlisted']) {
    const response = buildElevenLabsInitResponse({
      schema_version: '1',
      dynamic_variables: {
        caller_identity_status: 'verified_owner',
        caller_access_tier: 'tier_owner',
        calendar_share_level: 'details',
        call_reentry_notice_pending: 'true',
        call_answering_status: status,
      },
    }, envWithPolicy())
    assert.ok(response)
    assert.deepEqual((response!.conversation_config_override as any).agent.prompt.tool_ids, [], status)
  }
})

test('outbound calls get only outbound-scoped tools regardless of contact role or calendar share', () => {
  const response = buildElevenLabsInitResponse({
    schema_version: '1',
    dynamic_variables: {
      caller_identity_status: 'verified_contact',
      calendar_share_level: 'details',
      call_reentry_notice_pending: 'true',
      call_answering_status: 'allowed',
    },
  }, envWithPolicy(), { outbound_call: true })

  assert.ok(response)
  assert.deepEqual((response!.conversation_config_override as any).agent.prompt.tool_ids, ['outbound-retrieve'])
})

test('missing or malformed tool policy produces an empty dynamic tool surface instead of falling back open', () => {
  const missing = buildElevenLabsInitResponse({ schema_version: '1', dynamic_variables: {} }, {})
  assert.ok(missing)
  assert.deepEqual((missing!.conversation_config_override as any).agent.prompt.tool_ids, [])

  const malformed = buildElevenLabsInitResponse({ schema_version: '1', dynamic_variables: {} }, {
    PHONE_TOOL_POLICY_JSON: JSON.stringify({ owner: ['owner'], external: ['external'], unknown: [] }),
  })
  assert.ok(malformed)
  assert.deepEqual((malformed!.conversation_config_override as any).agent.prompt.tool_ids, [])
})
