const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
Deno.serve(()=>new Response(JSON.stringify({error:'not_found'}),{status:404,headers}));

