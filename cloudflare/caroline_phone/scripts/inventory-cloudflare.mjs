const token = process.env.CLOUDFLARE_API_TOKEN
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '882fc7501e4632c7c58879d5c1d5b672'
if (!token) { console.error('Set CLOUDFLARE_API_TOKEN.'); process.exit(2) }
const base=`https://api.cloudflare.com/client/v4/accounts/${accountId}`
async function cf(path){const response=await fetch(`${base}${path}`,{headers:{Authorization:`Bearer ${token}`}}); const payload=await response.json().catch(()=>null); if(!response.ok||!payload?.success)throw new Error(`GET ${path} failed`); return payload.result}
function list(result,keys=[]){if(Array.isArray(result))return result; for(const k of keys)if(Array.isArray(result?.[k]))return result[k]; return []}
function nameOf(v){return v?.name||v?.queue_name||v?.title||v?.id||null}
const [workersRaw,kvRaw,r2Raw,queuesRaw]=await Promise.all([cf('/workers/scripts'),cf('/storage/kv/namespaces'),cf('/r2/buckets'),cf('/queues')])
const workers=list(workersRaw,['scripts']), kv=list(kvRaw,['namespaces']), r2=list(r2Raw,['buckets']), queues=list(queuesRaw,['queues'])
const phoneKv=kv.find(v=>v?.title==='Caroline_Phone')
console.log(JSON.stringify({mode:'read_only_inventory',account_id:accountId,workers:workers.map(nameOf).filter(Boolean),caroline_phone_kv:phoneKv?{title:phoneKv.title,id:phoneKv.id}:null,r2:r2.map(nameOf).filter(Boolean),queues:queues.map(nameOf).filter(Boolean)},null,2))
