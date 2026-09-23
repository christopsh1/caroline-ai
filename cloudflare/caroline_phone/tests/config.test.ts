import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const wrangler = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts?: Record<string, string>
}

test('Worker is named caroline-phone and has no plaintext runtime secrets or vars', () => {
  assert.match(wrangler, /^name = "caroline-phone"/m)
  assert.doesNotMatch(wrangler, /^\[vars\]/m)
  assert.doesNotMatch(wrangler, /ELEVENLABS_API_KEY\s*=/)
  assert.doesNotMatch(wrangler, /ELEVENLABS_AGENT_ID\s*=/)
  assert.doesNotMatch(wrangler, /TWILIO_AUTH_TOKEN\s*=/)
  assert.doesNotMatch(wrangler, /OUTBOUND_API_TOKEN\s*=/)
})

test('deploy preserves Cloudflare-managed secrets and variables', () => {
  assert.equal(packageJson.scripts?.deploy, 'wrangler deploy --keep-vars')
})
