import { createClient } from '@supabase/supabase-js'
const U=Deno.env.get('SUPABASE_URL')!,SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,RK=Deno.env.get('CAROLINE_RUNTIME_KEY'),db=createClient(U,SK)
const H={'Content-Type':'application/json','Cache-Control':'no-store'},J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H})
const str=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null
function phone(v:unknown){const r=str(v);if(!r)return null;const d=r.replace(/\D/g,'');let c='';if(r.startsWith('+'))c='+'+d;else if(d.length===10)c='+1'+d;else if(d.length===11&&d.startsWith('1'))c='+'+d;else c='+'+d;return /^\+[1-9]\d{7,14}$/.test(c)?c:null}
function auth(r:Request){return !!RK&&r.headers.get('x-caroline-key')===RK}
async function cfg(k:string){const{data}=await db.from('caroline_integration_config').select('value').eq('key',k).maybeSingle();return str(data?.value)}
async function ownerNumbers(){const [many,one]=await Promise.all([cfg('owner_phone_numbers'),cfg('owner_phone_number')]);const out=new Set<string>();if(many){try{for(const x of JSON.parse(many)){const n=phone(x);if(n)out.add(n)}}catch{}}const n=phone(one);if(n)out.add(n);return [...out]}
async function ownerOk(p:any){const expected=await cfg('telegram_owner_chat_id');return !!expected&&str(p?.owner_chat_id)===expected}
async function contactFor(n:string){const{data,error}=await db.from('contacts').select('*').eq('normalized_phone',n).maybeSingle();if(error)throw error;return data??null}
async function ensureContact(n:string,p:any){let c=await contactFor(n);if(c)return c;const display=str(p?.display_name);if(!display)return null;const{data,error}=await db.from('contacts').insert({normalized_phone:n,display_name:display,contact_type:'unknown',verification_status:'unverified',tone_profile:'professional',notes:'Owner-created phone admission record',metadata:{created_via:'phone_admission'}}).select('*').single();if(error)throw error;return data}
Deno.serve(async req=>{
 if(!auth(req))return J({error:'unauthorized'},401)
 if(req.method!=='POST')return J({error:'method_not_allowed'},405)
 let p:any={};try{p=await req.json()}catch{return J({error:'invalid_json'},400)}
 const path=new URL(req.url).pathname
 try{
  if(path.endsWith('/record-attempt')){
    const n=phone(p?.phone),state=str(p?.admission_state),conv=str(p?.conversation_id),reason=str(p?.reason)
    if(!n||!state||!['waitlisted','restricted_by_owner','banned','restricted'].includes(state))return J({error:'invalid_attempt'},400)
    const c=await contactFor(n),eventType=state==='waitlisted'?'waitlisted_attempt':'blocked_attempt',cutoff=new Date(Date.now()-15*60*1000).toISOString()
    const recentQ=await db.from('phone_admission_events').select('id,created_at').eq('normalized_phone',n).in('event_type',['waitlisted_attempt','blocked_attempt']).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(recentQ.error)return J({error:'admission_recent_lookup_failed',code:recentQ.error.code??null},500)
    const suppressNotify=!!recentQ.data
    const ins=await db.from('phone_admission_events').insert({normalized_phone:n,contact_id:c?.id??null,event_type:eventType,previous_status:null,new_status:state,reason,source_conversation_id:conv,created_by:'caroline_context_init',metadata:{admission_state:state,notification_suppressed:suppressNotify}}).select('id').single()
    if(ins.error)return J({error:'admission_event_insert_failed',code:ins.error.code??null},500)
    const eid='phone_admission_attempt:'+(conv??crypto.randomUUID())
    if(!suppressNotify){
      const details={normalized_phone:n,admission_state:state,failure_reason:reason??(state==='waitlisted'?'Number is not owner-admitted for Caroline voice access.':'Number is blocked from Caroline voice access.'),direction:'inbound',telephony_type:'inbound_phone'}
      const ev=await db.from('events_processed').upsert({event_id:eid,conversation_id:conv,event_type:'phone_admission_attempt',details,telegram_notification_status:'pending'},{onConflict:'event_id',ignoreDuplicates:true}).select('event_id').maybeSingle()
      if(ev.error)return J({error:'notification_event_insert_failed',code:ev.error.code??null},500)
      if(RK)EdgeRuntime.waitUntil(fetch(U+'/functions/v1/caroline-notify',{method:'POST',headers:{'Content-Type':'application/json','x-caroline-key':RK},body:JSON.stringify({event_id:eid})}).then(()=>{}).catch(()=>{}))
    }
    return J({ok:true,event_id:suppressNotify?null:eid,admission_event_id:ins.data.id,admission_state:state,notification_suppressed:suppressNotify,notification_cooldown_minutes:15})
  }
  if(!await ownerOk(p))return J({error:'unauthorized_owner'},403)
  if(path.endsWith('/list')){
    const status=str(p?.status);let q=db.from('contact_card_details').select('contact_id,access_status,access_reason,access_changed_at,access_changed_by,contacts:contact_id(display_name,normalized_phone,verification_status,contact_type)').order('access_changed_at',{ascending:false,nullsFirst:false}).limit(200);if(status&&['default','allow','restrict','ban'].includes(status))q=q.eq('access_status',status);const{data,error}=await q;if(error)return J({error:'admission_list_failed'},500);return J({ok:true,records:data??[]})
  }
  if(!path.endsWith('/set'))return J({error:'not_found'},404)
  const n=phone(p?.phone),action=str(p?.action),reason=str(p?.reason);if(!n||!action||!['allow','restrict','ban','default'].includes(action))return J({error:'phone_and_valid_action_required'},400)
  const owners=await ownerNumbers();if(owners.includes(n)&&action!=='allow')return J({error:'owner_phone_cannot_be_restricted'},409)
  const c=await ensureContact(n,p);if(!c)return J({error:'contact_not_found_display_name_required_for_new_number'},404)
  const existingQ=await db.from('contact_card_details').select('*').eq('contact_id',c.id).maybeSingle();if(existingQ.error)return J({error:'admission_card_lookup_failed'},500);const existing=existingQ.data,now=new Date().toISOString()
  const merged={contact_id:c.id,behavior_notes:existing?.behavior_notes??null,key_dates:existing?.key_dates??[],access_status:action,access_reason:reason,access_changed_at:now,access_changed_by:'owner_telegram',source_call_history_id:existing?.source_call_history_id??null,source_conversation_id:existing?.source_conversation_id??null,last_reviewed_at:now,last_reviewed_by:'owner_telegram',metadata:existing?.metadata??{},assigned_persona_tag:existing?.assigned_persona_tag??null,swearing_intensity:existing?.swearing_intensity??null}
  const{data:card,error}=await db.from('contact_card_details').upsert(merged,{onConflict:'contact_id'}).select('*').single();if(error)return J({error:'admission_update_failed'},500)
  const evt=action==='allow'?'owner_allowed':action==='restrict'?'owner_restricted':action==='ban'?'owner_banned':'owner_reset_default';await db.from('phone_admission_events').insert({normalized_phone:n,contact_id:c.id,event_type:evt,previous_status:existing?.access_status??'default',new_status:action,reason,created_by:'owner_telegram',metadata:{display_name:c.display_name}})
  return J({ok:true,contact:{id:c.id,display_name:c.display_name,normalized_phone:c.normalized_phone,verification_status:c.verification_status},access_status:action,reason})
 }catch(e){console.error('phone_admission_error',e);return J({error:'internal_error'},500)}
})

