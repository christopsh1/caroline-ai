
import { createClient } from '@supabase/supabase-js'
const U=Deno.env.get('SUPABASE_URL')!,SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,RK=Deno.env.get('CAROLINE_RUNTIME_KEY')
const db=createClient(U,SK),H={'Content-Type':'application/json','Cache-Control':'no-store'},J=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:H})
const str=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null
function auth(r:Request){return !!RK&&r.headers.get('x-caroline-key')===RK}
async function cfg(k:string){const{data}=await db.from('caroline_integration_config').select('value').eq('key',k).maybeSingle();return str(data?.value)}
Deno.serve(async req=>{
 if(!auth(req))return J({error:'unauthorized'},401)
 if(req.method!=='POST')return J({error:'method_not_allowed'},405)
 const sid=str(Deno.env.get('TWILIO_ACCOUNT_SID')),token=str(Deno.env.get('TWILIO_AUTH_TOKEN')),from=await cfg('twilio_phone_number')
 const reasons:string[]=[]
 if(!sid)reasons.push('TWILIO_ACCOUNT_SID_missing')
 if(!token)reasons.push('TWILIO_AUTH_TOKEN_missing')
 if(!from)reasons.push('twilio_phone_number_config_missing')
 let credentials_usable=false,twilio_http_status:number|null=null
 if(sid&&token){
   try{
     const rr=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(sid)+'.json',{
       method:'GET',headers:{Authorization:'Basic '+btoa(sid+':'+token)}
     })
     twilio_http_status=rr.status
     credentials_usable=rr.ok
     if(!rr.ok)reasons.push('twilio_credentials_rejected')
   }catch{reasons.push('twilio_connectivity_check_failed')}
 }
 return J({
   ok:true,
   ready:!!sid&&!!token&&!!from&&credentials_usable,
   prerequisites:{
     account_sid_present:!!sid,
     auth_token_present:!!token,
     sending_number_configured:!!from,
     credentials_usable
   },
   twilio_http_status,
   blocked_reasons:reasons
 })
})

