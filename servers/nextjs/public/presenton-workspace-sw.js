/* App business transport only. Runtime authentication stays in the public Kit session in the owning page. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const business = path => /^\/(?:api\/(?!runtime-access\/|auth\/runtime-clients\/)|app_data\/|static\/)/.test(path);
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !business(url.pathname)) return;
  event.respondWith((async () => {
    const client = event.clientId && await self.clients.get(event.clientId);
    if (!client) return new Response('Return to Presenton and reopen this file while connected to your PC.', {status:409});
    const channel = new MessageChannel();
    const body = ['GET','HEAD'].includes(event.request.method) ? null : await event.request.arrayBuffer();
    return new Promise(resolve => {
      let controller, answered=false;
      let timer=setTimeout(()=>finish('The Presenton page is not connected. Return to it and reconnect.'),45000);
      function finish(error){clearTimeout(timer);if(!answered){answered=true;resolve(new Response(JSON.stringify({detail:error}),{status:503,headers:{'Content-Type':'application/json'}}));}else controller?.error(new Error(error));channel.port1.close();}
      channel.port1.onmessage=({data})=>{
        clearTimeout(timer);
        timer=setTimeout(()=>finish('The Presenton connection ended. Reopen the original task to check its result.'),45000);
        if(data.heartbeat)return;
        if(data.error){finish(data.error);return;}
        if(!answered){answered=true;
          const stream=new ReadableStream({start(value){controller=value;},pull(){channel.port1.postMessage({pull:true});},cancel(){channel.port1.postMessage({cancel:true});channel.port1.close();}});
          resolve(new Response([204,205,304].includes(data.status)||event.request.method==='HEAD'?null:stream,{status:data.status,headers:{...data.headers,'Cache-Control':'no-store'}}));
        }
        if(data.bytes?.byteLength)controller?.enqueue(new Uint8Array(data.bytes));
        if(data.done){clearTimeout(timer);controller?.close();channel.port1.close();}
      };
      client.postMessage({type:'presenton-workspace',path:url.pathname+url.search,method:event.request.method,
        contentType:event.request.headers.get('content-type')||'',range:event.request.headers.get('range')||'',body},[channel.port2,...(body?[body]:[])]);
    });
  })());
});
