import assert from 'node:assert/strict'
import test from 'node:test'
import { handleElevenLabsWebhook } from '../src/handlers/elevenlabs.ts'
import { consumeEventBatch } from '../src/lib/consumer.ts'
import { hmacSha256Hex, sha256Hex } from '../src/lib/security.ts'
import type { CarolineEventEnvelope, QueuedEventPointer } from '../src/types.ts'

class MemoryR2 {
  objects = new Map<string,string>()
  async put(key:string,value:string){this.objects.set(key,value)}
  async get(key:string){const value=this.objects.get(key); return value===undefined?null:{text:async()=>value}}
  async delete(key:string){this.objects.delete(key)}
}

test('verified ElevenLabs event is durably staged and queued even while Neon delivery is pending', async () => {
  const r2 = new MemoryR2()
  const queued: QueuedEventPointer[] = []
  const q = { async send(body:QueuedEventPointer){queued.push(body)} }
  const secret='el-secret'
  const ts=Math.floor(Date.now()/1000)
  const raw=JSON.stringify({type:'post_call_transcription',event_timestamp:ts,data:{conversation_id:'conv'}})
  const sig=await hmacSha256Hex(secret,`${ts}.${raw}`)
  const req=new Request('https://edge.test/webhook/elevenlabs',{method:'POST',headers:{'Content-Type':'application/json','ElevenLabs-Signature':`t=${ts},v0=${sig}`},body:raw})
  const response=await handleElevenLabsWebhook(req,{ENVIRONMENT:'development',ELEVENLABS_WEBHOOK_SECRET:secret,CAROLINE_PAYLOADS:r2 as any,CAROLINE_EVENT_QUEUE:q as any},'r')
  assert.equal(response.status,200)
  assert.equal(queued.length,1)
  assert.equal(r2.objects.size,1)
  assert.equal((await response.json() as any).canonical_delivery,'pending_neon')
})

test('queue consumer retries and retains staged R2 payload while canonical Neon delivery is pending', async () => {
  const r2=new MemoryR2()
  const envelope:CarolineEventEnvelope={schema_version:'1',event_id:'e',request_id:'r',environment:'development',source:'elevenlabs',source_event_type:'post_call_transcription',source_event_timestamp:1,received_at:new Date().toISOString(),payload_sha256:'abc',payload:{}}
  const raw=JSON.stringify(envelope)
  const pointer:QueuedEventPointer={schema_version:'1',event_id:'e',request_id:'r',environment:'development',source:'elevenlabs',source_event_type:'post_call_transcription',received_at:envelope.received_at,object_key:'x',envelope_sha256:await sha256Hex(raw)}
  r2.objects.set('x',raw)
  const message={body:pointer,acked:false,retried:false,ack(){this.acked=true},retry(){this.retried=true}}
  await consumeEventBatch({messages:[message]} as any,{CAROLINE_PAYLOADS:r2 as any})
  assert.equal(message.retried,true)
  assert.equal(message.acked,false)
  assert.equal(r2.objects.has('x'),true)
})
