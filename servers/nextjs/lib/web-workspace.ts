import type { NimiAppScope } from '@nimiplatform/kit/core/app-session';

const INTEGRATION='io.github.nimiplatform.presenton.workspace.v1';
const OPERATIONS=['workspace.status','workspace.upload','workspace.request','workspace.response','workspace.close'];
function within<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason??new Error('Presenton connection ended'));
    if(signal.aborted){void promise.catch(()=>undefined);abort();return;}signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
function encode(bytes:Uint8Array){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);}

export type WorkspaceFetchRequest = { type:'presenton-workspace'; path:string; method:string; contentType:string; range:string; body:ArrayBuffer|null };

/** A captured public scope. Neither a new document nor a reconnect can replace it. */
// @nimi-authority: rule.nimi.sdks.feature-clients.integrations
export async function createWorkspaceTransport(scope:NimiAppScope){
  const api=scope.client.integration;
  const targets=(await within(api.listCatalog(),scope.signal)).filter(row=>row.integrationId===INTEGRATION&&row.available);
  if(!targets.length)throw new Error('Open Presenton on your PC and keep it open to use its presentation workspace here.');
  const permitted=targets.filter(row=>OPERATIONS.every(operation=>row.permittedOperations.includes(operation)));
  if(permitted.length!==1)throw new Error(permitted.length?'More than one Presenton PC workspace is available. In Nimi Home → Integrations, allow only the workspace you want.':'In PC Nimi Home → Integrations, allow this App source to use the Presenton workspace operations.');
  const targetRef=permitted[0].targetRef;
  async function call(operation:string,input:unknown,extraSignal?:AbortSignal):Promise<any>{
    const signal=AbortSignal.any([scope.signal,...(extraSignal?[extraSignal]:[]),AbortSignal.timeout(60_000)]);
    signal.throwIfAborted();
    let phase='sending';
    try {
      let result=await within(api.invoke({targetRef,operation,inputJson:JSON.stringify(input)}),signal);
      phase='waiting for the PC reply';
      while(result.status==='accepted'){
        await within(new Promise(resolve=>setTimeout(resolve,100)),signal);
        result=await within(api.getCall({callId:result.callId}),signal);
      }
      if(result.status!=='completed')throw new Error(result.errorCode||result.status);
      return JSON.parse(result.resultJson);
    } catch(error) {
      throw new Error(`${operation} failed while ${phase}: ${error instanceof Error?error.message:String(error)}. Check the original PC task before retrying; no request was replayed.`);
    }
  }
  if(!(await call('workspace.status',{})).ready)throw new Error('Presenton is still opening its PC workspace. Wait for the PC library, then retry.');
  const active=new Set<AbortController>();
  function handleRequest(input:WorkspaceFetchRequest,port:MessagePort){
    const id=crypto.randomUUID(),control=new AbortController();active.add(control);
    port.postMessage({heartbeat:true});const heartbeat=setInterval(()=>port.postMessage({heartbeat:true}),10000);
    const signal=AbortSignal.any([scope.signal,control.signal]);let busy=false,done=false,started=false;
    const fail=(cause:unknown)=>{if(done)return;done=true;clearInterval(heartbeat);port.postMessage({error:cause instanceof Error?cause.message:String(cause)});port.close();active.delete(control);};
    const abort=()=>fail(new Error('Presenton connection ended. Reconnect to inspect the original task; unfinished work has not been replayed.'));
    signal.addEventListener('abort',abort,{once:true});
    async function pull(){
      if(busy||done)return;busy=true;
      try{
        let chunk=await call('workspace.response',{id},signal);
        while(chunk.pending){await within(new Promise(resolve=>setTimeout(resolve,150)),signal);chunk=await call('workspace.response',{id},signal);}
        if(chunk.error)throw new Error(chunk.error);
        if(!Number.isInteger(chunk.status)||chunk.status<200||chunk.status>599||typeof chunk.data!=='string')throw new Error('Invalid PC response');
        const bytes=Uint8Array.from(atob(chunk.data),char=>char.charCodeAt(0));
        port.postMessage({status:chunk.status,headers:chunk.headers,done:chunk.done,bytes:bytes.buffer},[bytes.buffer]);
        if(chunk.done){done=true;clearInterval(heartbeat);port.close();active.delete(control);signal.removeEventListener('abort',abort);}
      }catch(error){fail(error);}finally{busy=false;}
    }
    port.onmessage=({data})=>{if(data.cancel){control.abort();if(started&&!scope.signal.aborted)void call('workspace.close',{id}).catch(()=>undefined);}else if(data.pull)void pull();};
    void(async()=>{
      try{
        if(input.body){const bytes=new Uint8Array(input.body);if(bytes.length>128*1024*1024)throw new Error('Uploads are limited to 128 MiB.');
          for(let offset=0;offset<bytes.length;offset+=65536)await call('workspace.upload',{id,size:bytes.length,offset,data:encode(bytes.subarray(offset,offset+65536))},signal);}
        await call('workspace.request',{id,path:input.path,method:input.method,contentType:input.contentType,range:input.range},signal);started=true;await pull();
      }catch(error){fail(error);}
    })();
  }
  return {targetRef,handleRequest,dispose:()=>{for(const control of active)control.abort();active.clear();}};
}

export async function prepareWorkspaceWorker(signal:AbortSignal){
  await navigator.serviceWorker.register('/presenton-workspace-sw.js',{scope:'/'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await within(new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true})),signal);
  signal.throwIfAborted();
}

export async function connectWebWorkspace(scope:NimiAppScope){
  const transport=await createWorkspaceTransport(scope);
  try{await prepareWorkspaceWorker(scope.signal);}catch(error){transport.dispose();throw error;}
  const onMessage=(event:MessageEvent)=>{if(event.data?.type==='presenton-workspace'&&event.ports[0])transport.handleRequest(event.data,event.ports[0]);};
  navigator.serviceWorker.addEventListener('message',onMessage);
  return()=>{navigator.serviceWorker.removeEventListener('message',onMessage);transport.dispose();};
}

/** The main Android frame downloads through its captured connection, never a mutable global fetch. */
export function readWorkspaceExport(transport:Awaited<ReturnType<typeof createWorkspaceTransport>>,path:string):Promise<Response>{
  const url=new URL(path,location.origin);
  if(url.origin!==location.origin||url.pathname!=='/api/export-presentation/file')return Promise.reject(new Error('Only Presenton exports can be saved.'));
  const channel=new MessageChannel();
  return new Promise((resolve,reject)=>{
    let controller:ReadableStreamDefaultController<Uint8Array>|undefined,answered=false;
    channel.port1.onmessage=({data})=>{
      if(data.heartbeat)return;
      if(data.error){if(answered)controller?.error(new Error(data.error));else reject(new Error(data.error));channel.port1.close();return;}
      if(!answered){answered=true;const body=new ReadableStream<Uint8Array>({start(value){controller=value;},pull(){channel.port1.postMessage({pull:true});},cancel(){channel.port1.postMessage({cancel:true});channel.port1.close();}});resolve(new Response(body,{status:data.status,headers:data.headers}));}
      if(data.bytes?.byteLength)controller?.enqueue(new Uint8Array(data.bytes));
      if(data.done){controller?.close();channel.port1.close();}
    };
    transport.handleRequest({type:'presenton-workspace',path:url.pathname+url.search,method:'GET',contentType:'',range:'',body:null},channel.port2);
  });
}
