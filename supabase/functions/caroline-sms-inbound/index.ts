
import { createClient } from '@supabase/supabase-js'
const U=Deno.env.get('SUPABASE_URL')!,SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,RK=Deno.env.get('CAROLINE_RUNTIME_KEY'),TW=Deno.env.get('TWILIO_AUTH_TOKEN'),db=createClient(U,SK)
const XML='<Response></Response>'
const str=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null
function phone(v:unknown){const r=str(v);if(!r)return null;const d=r.replace(/\D/g,'');let c='';if(r.startsWith('+'))c='+'+d;else if(d.length===10)c='+1'+d;else if(d.length===11&&d.startsWith('1'))c='+'+d;else c='+'+d;return /^\+[1-9]\d{7,14}$/.test(c)?c:null}
function externalUrl(req:Request){const u=new URL(req.url),host=req.headers.get('x-forwarded-host')||req.headers.get('host')||u.host,proto=(req.headers.get('x-forwarded-proto')||u.protocol.replace(':',''));return proto+'://'+host+u.pathname+u.search}
async function validTwilio(req:Request,params:URLSearchParams){if(!TW)return false;const sig=str(req.headers.get('x-twilio-signature'));if(!sig)return false;let base=externalUrl(req);const pairs=[...params.entries()].sort((a,b)=>a[0].localeCompare(b[0]));for(const [k,v] of pairs)base+=k+v;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(TW),{name:'HMAC',hash:'SHA-1'},false,['sign']);const raw=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(base)));let bin='';for(const b of raw)bin+=String.fromCharCode(b);const expected=btoa(bin);if(expected.length!==sig.length)return false;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i);return diff===0}
Deno.serve(async req=>{if(req.method!=='POST')return new Response(XML,{status:405,headers:{'Content-Type':'text/xml'}});const raw=await req.text(),params=new URLSearchParams(raw);if(!await validTwilio(req,params))return new Response(XML,{status:403,headers:{'Content-Type':'text/xml'}});const from=phone(params.get('From')),to=phone(params.get('To')),body=str(params.get('Body'))??'',sid=str(params.get('MessageSid'));if(!from||!sid)return new Response(XML,{status:400,headers:{'Content-Type':'text/xml'}})
let contact:any=null
if(RK){try{const rr=await fetch(U+'/functions/v1/caroline-contact-resolve',{method:'POST',headers:{'Content-Type':'application/json','x-caroline-key':RK},body:JSON.stringify({internal_phone_lookup:true,phone:from})});if(rr.ok){const j=await rr.json();if(j?.match_count===1)contact=j.candidates?.[0]??null}}catch{}}
const{data:prior}=await db.from('sms_history').select('id').eq('provider_message_id',sid).maybeSingle()
if(prior)return new Response(XML,{status:200,headers:{'Content-Type':'text/xml','Cache-Control':'no-store'}})
const{data:sms,error}=await db.from('sms_history').insert({normalized_phone:from,contact_id:contact?.id??null,direction:'inbound',body,provider_message_id:sid,status:'received',telegram_notification_status:'pending'}).select('id').single()
const suppressNotify=!!RK&&req.headers.get('x-caroline-key')===RK&&req.headers.get('x-caroline-regression-no-notify')==='true'
if(!error&&sms?.id&&RK&&!suppressNotify)EdgeRuntime.waitUntil(fetch(U+'/functions/v1/caroline-notify',{method:'POST',headers:{'Content-Type':'application/json','x-caroline-key':RK},body:JSON.stringify({sms_history_id:sms.id,notification_kind:'inbound'})}).catch(()=>{}))
return new Response(XML,{status:200,headers:{'Content-Type':'text/xml','Cache-Control':'no-store'}})
})

