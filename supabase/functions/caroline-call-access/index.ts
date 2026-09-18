
import { createClient } from '@supabase/supabase-js'
const U=Deno.env.get('SUPABASE_URL')!,SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,RK=Deno.env.get('CAROLINE_RUNTIME_KEY')
const db=createClient(U,SK),H={'Content-Type':'application/json','Cache-Control':'no-store'}
const J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H})
const str=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null
function phone(v:unknown){const r=str(v);if(!r)return null;const d=r.replace(/\D/g,'');let c='';if(r.startsWith('+'))c='+'+d;else if(d.length===10)c='+1'+d;else if(d.length===11&&d.startsWith('1'))c='+'+d;else c='+'+d;return /^\+[1-9]\d{7,14}$/.test(c)?c:null}
function auth(r:Request){return !!RK&&r.headers.get('x-caroline-key')===RK}
async function cfg(k:string){const{data}=await db.from('caroline_integration_config').select('value').eq('key',k).maybeSingle();return str(data?.value)}
async function ownerOk(p:any){const expected=await cfg('telegram_owner_chat_id');return !!expected&&str(p?.owner_chat_id)===expected}
async function contactFor(n:string){const{data}=await db.from('contacts').select('id,display_name,normalized_phone').eq('normalized_phone',n).maybeSingle();return data??null}
async function active(n:string){const{data}=await db.from('call_answering_restrictions').select('*').eq('normalized_phone',n).eq('status','active').maybeSingle();return data??null}
async function restrictCurrent(p:any){
  const n=phone(p?.phone);if(!n)return J({error:'invalid_phone'},400)
  const prior=await active(n);if(prior)return J({ok:true,duplicate:true,restriction:prior})
  const c=await contactFor(n)
  await db.from('call_answering_restrictions').update({reentry_notice_pending:false,reentry_notice_consumed_at:new Date().toISOString()}).eq('normalized_phone',n).eq('status','cleared').eq('reentry_notice_pending',true)
  const reason=str(p?.reason_summary)??'Caller repeated an attempt to override Caroline’s assigned persona/tone after a clear final warning.'
  const{data,error}=await db.from('call_answering_restrictions').insert({
    normalized_phone:n,contact_id:c?.id??null,status:'active',reason_code:'repeated_persona_boundary_pressure',
    reason_summary:reason,imposed_by:'caroline_boundary_enforcement',metadata:{source:'phone_boundary_tool'}
  }).select('*').single()
  if(error)return J({error:'restriction_persistence_failed'},500)
  return J({ok:true,duplicate:false,restriction:data})
}
async function clearRestriction(p:any){
  if(!await ownerOk(p))return J({error:'unauthorized_owner'},403)
  const n=phone(p?.phone);if(!n)return J({error:'invalid_phone'},400)
  const r=await active(n);if(!r)return J({error:'active_restriction_not_found'},404)
  const{data,error}=await db.from('call_answering_restrictions').update({
    status:'cleared',cleared_at:new Date().toISOString(),cleared_by:'owner_telegram',clear_note:str(p?.clear_note),
    reentry_notice_pending:true,reentry_notice_consumed_at:null
  }).eq('id',r.id).select('*').single()
  if(error)return J({error:'restriction_clear_failed'},500)
  return J({ok:true,restriction:data})
}
async function consumeReentry(p:any){
  const n=phone(p?.phone);if(!n)return J({error:'invalid_phone'},400)
  const{data:r}=await db.from('call_answering_restrictions').select('*').eq('normalized_phone',n).eq('status','cleared').eq('reentry_notice_pending',true).order('cleared_at',{ascending:false}).limit(1).maybeSingle()
  if(!r)return J({ok:true,consumed:false})
  const{data,error}=await db.from('call_answering_restrictions').update({reentry_notice_pending:false,reentry_notice_consumed_at:new Date().toISOString()}).eq('id',r.id).select('id,reentry_notice_pending,reentry_notice_consumed_at').single()
  if(error)return J({error:'reentry_update_failed'},500)
  return J({ok:true,consumed:true,restriction:data})
}
async function listRestrictions(p:any){
  if(!await ownerOk(p))return J({error:'unauthorized_owner'},403)
  const status=['active','cleared','all'].includes(p?.status)?p.status:'active'
  let q=db.from('call_answering_restrictions').select('*,contacts:contact_id(display_name,normalized_phone)').order('imposed_at',{ascending:false}).limit(100)
  if(status!=='all')q=q.eq('status',status)
  const{data,error}=await q;if(error)return J({error:'restriction_read_failed'},500)
  return J({ok:true,restrictions:data??[]})
}
async function recordAttempt(p:any){
  const n=phone(p?.phone);if(!n)return J({error:'invalid_phone'},400)
  const r=await active(n);if(!r)return J({ok:true,recorded:false,reason:'not_restricted'})
  const conv=str(p?.conversation_id);const eventId='restricted_call_attempt:'+(conv??crypto.randomUUID())
  const details={failure_reason:'Restricted caller attempt. Calls from this number are not being engaged until Chris re-authorizes them. Restriction reason: '+(r.reason_summary??r.reason_code),telephony_type:'inbound_phone',direction:'inbound',normalized_phone:n,restriction_id:r.id}
  const{data,error}=await db.from('events_processed').upsert({event_id:eventId,conversation_id:conv,event_type:'restricted_call_attempt',details,telegram_notification_status:'pending'},{onConflict:'event_id',ignoreDuplicates:true}).select('*').maybeSingle()
  if(error)return J({error:'restricted_attempt_persistence_failed'},500)
  if(RK){try{await fetch(U+'/functions/v1/caroline-notify',{method:'POST',headers:{'Content-Type':'application/json','x-caroline-key':RK},body:JSON.stringify({event_id:eventId})})}catch{}}
  return J({ok:true,recorded:true,event_id:eventId,restriction_id:r.id})
}
async function status(p:any){
  const n=phone(p?.phone);if(!n)return J({error:'invalid_phone'},400)
  const a=await active(n)
  const conv=str(p?.conversation_id)
  const{data:re}=await db.from('call_answering_restrictions').select('id,reason_code,reason_summary,cleared_at,clear_note,reentry_notice_pending').eq('normalized_phone',n).eq('status','cleared').eq('reentry_notice_pending',true).order('cleared_at',{ascending:false}).limit(1).maybeSingle()
  let restrictedAttemptRecorded=false
  if(conv){const{data:e}=await db.from('events_processed').select('event_id').eq('event_id','restricted_call_attempt:'+conv).maybeSingle();restrictedAttemptRecorded=!!e}
  return J({ok:true,active_restriction:a,reentry_notice:re??null,restricted_attempt_recorded:restrictedAttemptRecorded})
}
Deno.serve(async req=>{if(!auth(req))return J({error:'unauthorized'},401);if(req.method!=='POST')return J({error:'method_not_allowed'},405);let p:any={};try{p=await req.json()}catch{return J({error:'invalid_json'},400)}const path=new URL(req.url).pathname;try{
  if(path.endsWith('/restrict-current'))return await restrictCurrent(p)
  if(path.endsWith('/owner-clear'))return await clearRestriction(p)
  if(path.endsWith('/consume-reentry'))return await consumeReentry(p)
  if(path.endsWith('/list'))return await listRestrictions(p)
  if(path.endsWith('/record-restricted-attempt'))return await recordAttempt(p)
  if(path.endsWith('/status'))return await status(p)
  return J({error:'not_found'},404)
}catch(e){console.error(JSON.stringify({service:'caroline-call-access',event:'request_failed',detail:String(e)}));return J({error:'internal_error'},500)}})

