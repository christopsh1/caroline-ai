import assert from 'node:assert/strict'
import test from 'node:test'
import { buildElevenLabsInitResponse, normalizeDynamicVariables, roleFromVariables } from '../src/lib/init-contract.ts'

test('init contract defaults missing context to fail-closed privacy values', () => {
  const vars = normalizeDynamicVariables({ caller_identity_status: 'unknown', malicious_internal_value: 'do-not-forward' })
  assert.equal(vars.caller_access_tier, 'tier_0_unknown_unverified')
  assert.equal(vars.calendar_share_level, 'none')
  assert.equal('malicious_internal_value' in vars, false)
  assert.equal(roleFromVariables(vars), 'unknown')
})

test('init contract gives only role-configured tool ids and whitelisted variables', () => {
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
  }, {
    PHONE_TOOL_POLICY_JSON: JSON.stringify({ owner: ['owner-a', 'owner-b'], external: ['external-a'], unknown: [] }),
  })

  assert.ok(response)
  const vars = response!.dynamic_variables as Record<string, string>
  assert.equal(vars.bio_short, 'safe bio')
  assert.equal('database_password' in vars, false)
  const agent = (response!.conversation_config_override as any).agent
  assert.deepEqual(agent.prompt.tool_ids, ['owner-a', 'owner-b'])
  assert.equal(agent.first_message, 'Welcome back.')
  assert.equal('llm' in agent.prompt, false)
})

test('missing tool policy produces an empty dynamic tool surface instead of falling back open', () => {
  const response = buildElevenLabsInitResponse({ schema_version: '1', dynamic_variables: {} }, {})
  assert.ok(response)
  assert.deepEqual((response!.conversation_config_override as any).agent.prompt.tool_ids, [])
})
