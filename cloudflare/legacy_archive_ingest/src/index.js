const PROJECT_REF = 'drsyygxqwxuyoyjbsaqs'
const RUN_ID = '01M3A2HCA9BFSK5PB5MF26EFKE'
const ALLOWED_SOURCE_IP = '13.216.119.224'
const EXPIRES_AT = Date.parse('2026-09-24T18:30:00Z')

const RAG_EXCLUDED = new Set(['documents','document_chunks','system_docs','corpus_health_log','interaction_chunks','agent_memory','memory_items','contact_profile_items','call_transcript_chunks'])
const PROHIBITED = new Set(['vault.decrypted_secrets'])

// bucket, prefix, pk columns, row count, snapshot PK hash, approved-column-set hash
const S = {
  agent_creator_runs:['caroline-events-raw','events',['id'],4,'9c4c9e5b7a8b3d8d11e3854436b0c17b1a82064b9f53642922848d011079bd93','b5a1fbaadaabbee23d8361356d75f22f52dccc8803dda4b70cc504e47da27989'],
  agent_improvements:['caroline-events-raw','events',['id'],5,'97ef7318df4c9606657fce95e98349e9850e2ecb26f83b9f6b1d82f384ffc8c0','1ddae858f6e187c4c35298ac3e45f6107c4289764d7f37897d0ec52f608a66d5'],
  agent_runs:['caroline-events-raw','events',['id'],9,'6b139c6e5db637b0aff05f23a3c05b163261416c27fb86abc56fdf85a15a403c','91295fca8183ea28a4bad61002c9abd15745c989b27421259ea15c74eff28a6b'],
  airtable_sync_jobs:['caroline-events-raw','events',['source_table','source_id'],138,'98e1f1605f7b14c18c3df087b57bfc35c223f471a25bf39bbeb93cabc2f64889','d0fc23220f3d3339b8e71ca7c015e908f9b4f66d781b1e6b9b3525febffb2d81'],
  availability_state:['caroline-artifacts','reference',['id'],1,'b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b','7895fcfe21f642160afeb108dbca88cec4655b0464d03e82bd7975d092eb4d42'],
  brain_turn_metrics:['caroline-events-raw','events',['id'],16,'6e8c6b63bdedf931e23896262fba72a7aa6bafed9babdd0a03177ef1a524ab29','99c5ca550220f9b0cb679cff44d292ae66c6518708292bfa8ce0b115b4fd1cb9'],
  calendar_events:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','9443233f3338ad23c8b3ef93d9891cd76fd19dc74da70e5244739d48d5d4e952'],
  calendar_shares:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','cb11e483f54e05477530f7df37228def6dd95510a21dc745b9f3e04ff9b87bd2'],
  call_answering_restrictions:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','512f7df1d8987072a36525b66795291e5a8f13e01d4f517306bb59fedc9ecee5'],
  call_history:['caroline-transcripts','communications',['id'],53,'da18309b08b7b39e4c1f617ffbc6f3b5781ddcfefece5391d64cc96f95cd6239','2656622f5519adee914e578ae487ec18fcfedaec45f8f9ef2ec4fcd30a07e4b6'],
  call_turns:['caroline-transcripts','communications',['id'],99,'907b828d328dbb14b6af8078f62716fb69499ca2badfe77b819245ccd5885599','1349446f90211eb4f436aee97ee304271ebb2eb9ceb6f4f40c6513bac1288a50'],
  commitments:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','b423bfedd4a04ca3d317ca905ba9c72dc4636c032eea63dea1a8db9f79c56a60'],
  contact_card_details:['caroline-artifacts','reference',['contact_id'],1,'f85810a10f4aff86e1cf6f9f4030f110047d83c97252a74d3b03fea3504ff661','3e2061654cd0d1ce956b61b24633e2ea0c8b1c7377ecd7f62957eac21a296f5a'],
  contact_card_field_provenance:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','002c0136a0b9ce3614703a4ec1f2c040ec0e5221ba09221a1b773314ac89c84b'],
  contact_mentions:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','6e927cdb44420eede70c553304687e7d961efdbf6c5c4f095c6925b8dd791ce2'],
  contact_permissions:['caroline-artifacts','reference',['id'],6,'1a27670ae4646b6771ac0d2c61cf10b2304030ad181faf90604658d14b1a3d44','d326b3db924156c11e536a5844198863d392b60ac8493c64a9af80ee026ee9a2'],
  contacts:['caroline-artifacts','reference',['id'],5,'29ce51d0478914b5476d8888f2467eecee0700f5f074798a3f657f1077763237','679d5d1d6bc3a1de88968f9d3dac08a36ec720c77f3ffca3cf71654edd7596f6'],
  events_processed:['caroline-events-raw','events',['event_id'],59,'5ff4be3abe08d51da7ff3aa585765703955cbe85691c1d0ba1b41acdfec0803b','ad99d79ebd529251ae1701f7f3e95ee962539dccd269e3b44a7b1bddc71581c6'],
  instructions:['caroline-artifacts','reference',['id'],1,'8fa5cd2be27afe0553b755a5c66be622874e04777ab603790ffe42dc20ab5d3c','88b72eb7acfe3da932390670bafc4a09268f5dce3f67869f511bcbd4fabd41ef'],
  phone_admission_events:['caroline-events-raw','events',['id'],7,'cdb95f321b6b6d12252645946c3bc68971e29dff74e03219625ba12f4def1680','425aa72d4eaab9512d160084f7dd1b93548a35db6d655b78880ead57e559309f'],
  project_contacts:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','7cf5ccfdc52fcd63fc399f5c60f1fbe93c4919bf7e00f02ddba45b8dbec1cca3'],
  projects:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','12aeac463646567a37cd78e6e859dc84e6c8e18864ed1f99ff2a8d43938ca23d'],
  relationships:['caroline-artifacts','reference',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','205abb0e82ef4e4330d8ae0b0ff6b81d51e6acdde2793d59892fb357fa6367ba'],
  scheduled_actions:['caroline-events-raw','events',['id'],1,'61fc688c54cab009bd79de886304d941c195daaf5c2857aa2241615c5e0edab0','5515ffc96b5b934382a419e944d31c4de2b5d5f7d580d6fd501f087de0bd6b40'],
  sms_history:['caroline-transcripts','communications',['id'],0,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','020f587cc2b30fd000a89a3730760a12dedfae005f15c7469896a29c4c307dd3'],
  transcript_ingestion_jobs:['caroline-events-raw','events',['call_history_id'],53,'da18309b08b7b39e4c1f617ffbc6f3b5781ddcfefece5391d64cc96f95cd6239','0e38c41457e876d9f02de3a76300976d7e07c77bcd26e4248ecc4fea650b0400'],
}

const CONFIDENTIAL = new Set(['agent_creator_runs','agent_improvements','projects'])
const INTERNAL = new Set(['airtable_sync_jobs'])
const PII = new Set(['availability_state','brain_turn_metrics','calendar_events','calendar_shares','call_answering_restrictions','call_history','call_turns','commitments','contact_card_details','contact_card_field_provenance','contact_mentions','contact_permissions','contacts','events_processed','instructions','phone_admission_events','project_contacts','relationships','scheduled_actions','sms_history','transcript_ingestion_jobs'])
const COMMS = new Set(['call_history','call_turns','contact_mentions','events_processed','instructions','scheduled_actions','sms_history'])
const PROMPT = new Set(['agent_creator_runs','agent_improvements','agent_runs','instructions','projects','scheduled_actions'])
const PROVIDER = new Set(['agent_creator_runs','agent_improvements','agent_runs','airtable_sync_jobs','brain_turn_metrics','call_answering_restrictions','call_history','call_turns','contact_card_details','contact_mentions','contacts','events_processed','phone_admission_events','scheduled_actions','sms_history','transcript_ingestion_jobs'])
const SECRET_REFS = new Set(['agent_creator_runs','agent_improvements','agent_runs'])

function out(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function canon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return'['+v.map(canon).join(',')+']';return'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'}
async function sha(v){const b=typeof v==='string'?new TextEncoder().encode(v):v;const d=await crypto.subtle.digest('SHA-256',b);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function gz(text){return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())}
function bucket(env,n){if(n==='caroline-events-raw')return env.CAROLINE_EVENTS_RAW;if(n==='caroline-transcripts')return env.CAROLINE_TRANSCRIPTS;if(n==='caroline-artifacts')return env.CAROLINE_ARTIFACTS;throw new Error('bucket_not_allowlisted')}
function pfx(rel,c){return`supabase/${PROJECT_REF}/${c[1]}/${rel}/export=${RUN_ID}`}
function scan(t){const p=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,/postgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/i,/\bsb_secret_[A-Za-z0-9_-]{10,}/i,/\bsk-[A-Za-z0-9_-]{16,}/i,/\bAKIA[0-9A-Z]{16}\b/,/authorization["']?\s*[:=]\s*["']?(?:Bearer\s+)?[A-Za-z0-9._~+/=-]{12,}/i];if(p.some(r=>r.test(t)))throw new Error('SECRET_SCAN_FAILED')}
async function putNew(b,key,bytes,type,rows=0){if(await b.head(key))throw new Error('IMMUTABLE_KEY_COLLISION');const h=await sha(bytes);const r=await b.put(key,bytes,{onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:type},sha256:h});if(!r)throw new Error('IMMUTABLE_KEY_COLLISION');const g=await b.get(key);if(!g||!('body'in g))throw new Error('READBACK_FAILED');const rb=new Uint8Array(await new Response(g.body).arrayBuffer());if(rb.byteLength!==bytes.byteLength||await sha(rb)!==h)throw new Error('READBACK_HASH_MISMATCH');return{key,size_bytes:bytes.byteLength,sha256:`sha256:${h}`,row_count:rows}}
async function manifestHash(m){const x=structuredClone(m);x.integrity.manifest_sha256='sha256:'+'0'.repeat(64);return sha(canon(x))}

async function ingest(req,env){
  if(Date.now()>EXPIRES_AT)return out({ok:false,error:'INGRESS_EXPIRED'},410)
  if((req.headers.get('CF-Connecting-IP')||'')!==ALLOWED_SOURCE_IP)return out({ok:false,error:'SOURCE_IP_FORBIDDEN'},403)
  let body;try{body=await req.json()}catch{return out({ok:false,error:'INVALID_JSON'},400)}
  const rel=String(body?.relation||'').toLowerCase()
  if(RAG_EXCLUDED.has(rel))return out({ok:false,error:'RAG_EXCLUDED_LEGACY_SURFACE'},403)
  if(PROHIBITED.has(rel))return out({ok:false,error:'PROHIBITED_SECRET_SOURCE'},403)
  const c=S[rel];if(!c)return out({ok:false,error:'RELATION_NOT_ALLOWLISTED'},403)
  if(body.run_id!==RUN_ID||body.project_ref!==PROJECT_REF)return out({ok:false,error:'RUN_ID_OR_SOURCE_MISMATCH'},403)
  if(!Array.isArray(body.rows)||!Array.isArray(body.approved_columns))return out({ok:false,error:'ROWS_OR_COLUMNS_REQUIRED'},400)
  if(body.rows.length!==c[3])return out({ok:false,error:'SNAPSHOT_ROW_COUNT_MISMATCH',expected:c[3],actual:body.rows.length},409)
  if(await sha([...body.approved_columns].map(String).sort().join('\n'))!==c[5])return out({ok:false,error:'APPROVED_COLUMN_CONTRACT_MISMATCH'},409)
  const expectedKeys=[...body.approved_columns].map(String).sort().join('\u0000');for(const r of body.rows){if(Object.keys(r).sort().join('\u0000')!==expectedKeys)throw new Error('ROW_COLUMN_CONTRACT_MISMATCH')}
  const pkLines=body.rows.map(r=>c[2].map(k=>r[k]===null||r[k]===undefined?'∅':String(r[k])).join('\x1f')).sort().join('\n')
  const pk=await sha(pkLines);if(pk!==c[4])return out({ok:false,error:'SNAPSHOT_PRIMARY_KEY_MISMATCH'},409)
  if(!/^[0-9a-f]{64}$/.test(String(body.schema_fingerprint||'')))return out({ok:false,error:'SCHEMA_FINGERPRINT_REQUIRED'},400)

  const jsonl=body.rows.map(canon).join('\n')+(body.rows.length?'\n':'');scan(jsonl);const data=await gz(jsonl)
  const tb=bucket(env,c[0]),prefix=pfx(rel,c),dataObj=await putNew(tb,`${prefix}/data-00001.jsonl.gz`,data,'application/gzip',body.rows.length)
  const actual=Array.isArray(body.actual_columns)?body.actual_columns.map(String):[],removed=actual.filter(x=>!body.approved_columns.includes(x)).sort()
  const report={policy_version:'caroline.export-redaction.v1',relation:rel,selection_strategy:'explicit approved-column allowlist; omitted columns were never selected',removed_columns:removed,transformed_columns:[],reason:'legacy migration boundary and credential/RAG minimization',future_configuration_mechanism:'${ENVIRONMENT_BINDING_REQUIRED}',legacy_value_exported_for_removed_fields:false}
  const rt=JSON.stringify(report,null,2)+'\n';scan(rt);const rObj=await putNew(env.CAROLINE_ARTIFACTS,`supabase/${PROJECT_REF}/redaction-reports/${RUN_ID}/${rel}.json`,new TextEncoder().encode(rt),'application/json')
  const now=new Date().toISOString(),sens=INTERNAL.has(rel)?'internal':CONFIDENTIAL.has(rel)?'confidential':'restricted'
  const manifest={manifest_version:'caroline.archive.v1',export_id:RUN_ID,archive_purpose:'legacy_supabase_reference_only',created_at:now,created_by:'caroline-legacy-archive/bridge-0.1.0',source:{provider:'supabase',project_ref:PROJECT_REF,schema:'public',relation:rel,relation_type:'table',source_schema_fingerprint:`sha256:${body.schema_fingerprint}`,extraction_method:'repeatable_read_allowlisted_export',source_query_redacted:`SELECT approved columns from public.${rel}; credentials and excluded columns omitted`,watermark:{column:null,from_exclusive:null,through_inclusive:now}},classification:{archive_category:c[0]==='caroline-events-raw'?'event':c[0]==='caroline-transcripts'?'transcript':'reference',sensitivity:sens,contains_pii:PII.has(rel),contains_communications:COMMS.has(rel),contains_prompt_text:PROMPT.has(rel),contains_provider_identifiers:PROVIDER.has(rel),contains_credentials:false,contains_secret_references:SECRET_REFS.has(rel),template_relevance:'high'},redaction:{performed:removed.length>0,policy_version:'caroline.export-redaction.v1',removed_columns:removed,transformed_columns:[],secret_scan_passed:true,prohibited_sources_checked:[...RAG_EXCLUDED,...PROHIBITED].sort()},dataset:{row_count:body.rows.length,primary_key_columns:c[2],primary_key_checksum_algorithm:'sha256',primary_key_checksum:`sha256:${pk}`},objects:[{bucket:c[0],key:dataObj.key,format:'jsonl',compression:'gzip',size_bytes:dataObj.size_bytes,sha256:dataObj.sha256,row_count:body.rows.length},{bucket:'caroline-artifacts',key:rObj.key,format:'json',compression:'none',size_bytes:rObj.size_bytes,sha256:rObj.sha256,row_count:0}],integrity:{manifest_sha256:'sha256:'+'0'.repeat(64),readback_verified:true,restore_test_status:'pending',restore_test_report_key:null},runtime_policy:{production_system_of_record:false,runtime_reads_allowed:false,rag_direct_reads_allowed:false,restore_requires_owner_approval:true}}
  manifest.integrity.manifest_sha256=`sha256:${await manifestHash(manifest)}`;const mt=JSON.stringify(manifest,null,2)+'\n';scan(mt);const mObj=await putNew(tb,`${prefix}/manifest.json`,new TextEncoder().encode(mt),'application/json')
  return out({ok:true,run_id:RUN_ID,relation:rel,row_count:body.rows.length,bucket:c[0],prefix,data_sha256:dataObj.sha256,manifest_sha256:manifest.integrity.manifest_sha256,manifest_object_sha256:mObj.sha256})
}

export default{async fetch(req,env){const u=new URL(req.url);try{if(req.method==='GET'&&u.pathname==='/health')return out({ok:true,service:'caroline-legacy-archive-ingest',run_id:RUN_ID,expires_at:new Date(EXPIRES_AT).toISOString(),bindings:{events_raw:Boolean(env.CAROLINE_EVENTS_RAW),transcripts:Boolean(env.CAROLINE_TRANSCRIPTS),artifacts:Boolean(env.CAROLINE_ARTIFACTS)}});if(req.method==='POST'&&u.pathname==='/ingest')return await ingest(req,env);return out({ok:false,error:'not_found'},404)}catch(e){return out({ok:false,error:e instanceof Error?e.message:'internal_error'},500)}}}
