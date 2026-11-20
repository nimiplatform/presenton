import type { NimiElectronAppBusinessServices } from '@nimiplatform/kit/shell/electron/main';
import { requestWorkspaceHttp } from './workspace-http.js';

export const WORKSPACE_INTEGRATION = 'io.github.nimiplatform.presenton.workspace.v1';
const MAX_BODY = 128 * 1024 * 1024;
const PUBLIC_SETTINGS = ['IMAGE_PROVIDER', 'DISABLE_IMAGE_GENERATION', 'WEB_GROUNDING', 'WEB_SEARCH_PROVIDER', 'WEB_SEARCH_MAX_RESULTS', 'PRESENTATION_GENERATION_MODE', 'PARALLEL_IMAGE_GENERATION'];
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => JSON.stringify({ type: 'object', additionalProperties: false, properties, required });
const id = { type: 'string', format: 'uuid' };
const descriptor = (name: string, displayName: string, effect: string, inputSchemaJson: string) => ({ name, displayName, effect, inputSchemaJson,
  description: 'Read, create, edit and delete presentations, import files, run workflows with the PC’s selected AI models, and export files. Projects, tasks, model choices and credentials stay on this PC. Operations are never automatically replayed.',
  outputSchemaJson: JSON.stringify({ type: 'object', additionalProperties: true }), supportsCancel: false, retryPolicy: 'none' });
export const WORKSPACE_OPERATIONS = [
  descriptor('workspace.status', 'Check Presenton PC workspace', 'read', object({})),
  descriptor('workspace.upload', 'Stage a presentation document or image', 'write', object({ id, size: {type:'integer', minimum:0, maximum:MAX_BODY}, offset:{type:'integer',minimum:0}, data:{type:'string',maxLength:87384} }, ['id','offset','data'])),
  descriptor('workspace.request', 'Use presentations, templates, tasks and exports', 'write', object({ id, path:{type:'string',maxLength:16384}, method:{type:'string',enum:['GET','HEAD','POST','PUT','PATCH','DELETE']}, contentType:{type:'string',maxLength:256}, range:{type:'string',maxLength:128} }, ['id','path','method'])),
  descriptor('workspace.response', 'Read a presentation result or asset', 'read', object({id})),
  descriptor('workspace.close', 'Stop a presentation transfer', 'write', object({id})),
];

/** No URL, Runtime method or credential is accepted here. Existing App routes retain their own validation. */
export function assertWorkspacePath(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\r\n#]/.test(raw)) throw new Error('Unsupported presentation address');
  const url = new URL(raw, 'http://presenton.invalid');
  const path = decodeURIComponent(url.pathname);
  if (path.includes('..') || path.includes('\\') || /[\x00-\x1f]/.test(path)) throw new Error('Unsupported presentation path');
  const next = /^\/api\/(?:user-config|read-file|templates|template(?:\/custom)?|upload-image|update-svg|export-presentation(?:\/file)?|telemetry-status|github-stars)$/;
  const business = /^\/api\/v[12]\/(?:ppt\/(?:presentation|slide|outlines|images|icons|files|fonts|generation|chat|template|template-management|themes?|community|documents|business-settings)(?:\/|$)|async-tasks(?:\/|$)|auth\/(?:status|presenton\/status)$)/;
  if (!next.test(path) && !business.test(path) && !/^\/(?:app_data|static)\//.test(path)) throw new Error('Unsupported Presenton business route');
  return url.pathname + url.search;
}

type Transfer = { owner:string; touched:number; size:number; received:number; parts:Buffer[]; controller:AbortController; label?:string;
  started?:boolean; response?:Response; reader?:ReadableStreamDefaultReader<Uint8Array>; pending?:Uint8Array; reading?:boolean; failure?:string };

// @nimi-authority: rule.nimi.sdks.feature-clients.integrations
export class PresentonWebWorkspace {
  error = '';
  private transfers = new Map<string, Transfer>();
  private stopped = false;
  private targetRef = '';
  private transferNote = '';
  get status() { return { registered: !!this.targetRef && !this.stopped, error: this.error, transferNote:this.transferNote }; }
  private timer: ReturnType<typeof setInterval>;
  constructor(private services:NimiElectronAppBusinessServices, private backend:()=>{ready:boolean;key:string;origin:string}) {
    this.timer = setInterval(() => { for(const [id,t] of this.transfers) if(Date.now()-t.touched>10*60_000)this.close(id); }, 60_000);
    void this.run();
  }
  private close(id:string) { const t=this.transfers.get(id); t?.controller.abort(); void t?.reader?.cancel().catch(()=>undefined);this.transfers.delete(id); }
  stop() { this.stopped=true;clearInterval(this.timer);for(const id of this.transfers.keys())this.close(id);if(this.targetRef)void this.services.integration.unregisterProvider({targetRef:this.targetRef}).catch(()=>undefined); }
  private async run() {
    try {
      const target=await this.services.integration.registerProvider({integrationId:WORKSPACE_INTEGRATION,displayName:'Presenton workspace on this PC',operations:WORKSPACE_OPERATIONS,
        skill:'Use the existing PC presentation workspace, including drafts, templates, uploaded material, AI workflows and PDF/PPTX export. Keep this PC App open. Start each request once and read its result; an uncertain result never authorizes repeating a write. Model settings and optional business credentials are configured on the PC.'});
      this.targetRef=target.targetRef;if(this.stopped){this.stop();return;}
      while(!this.stopped){const batch=await this.services.integration.pollProvider({waitMs:25000});if(this.stopped)return;
        for(const call of batch.calls) void (async()=>{
          let resultJson='',errorCode='';
          try{resultJson=JSON.stringify(await this.dispatch(call.consumerRef,call.operation,JSON.parse(call.inputJson)));}
          catch(error){errorCode='PRESENTON_WORKSPACE_REQUEST_FAILED';this.error=`${call.operation}: ${String(error)}`;}
          if(!this.stopped)await this.services.integration.completeProvider({callId:call.callId,resultJson,errorCode}).catch(error=>{
            const reason=(error as {reasonMetadata?:{integration_reason?:string}})?.reasonMetadata?.integration_reason;
            this.error=`Reply ${call.operation}: ${String(error)}${reason?` · ${reason}`:''}`;
          });
        })();
      }
    }catch(error){if(!this.stopped){
      const reason=(error as {reasonMetadata?:{integration_reason?:string}})?.reasonMetadata?.integration_reason;
      this.error=`${this.targetRef?'Polling':'Registration'}: ${String(error)}${reason?` · ${reason}`:''}`;
      process.stderr.write(`[presenton-web] ${this.error}\n`);
    }this.stop();}
  }
  async dispatch(owner:string, operation:string, input:Record<string,any>):Promise<unknown>{
    if(this.stopped || !owner)throw new Error('Presenton scope ended');
    const state=this.backend();
    if(operation==='workspace.status')return {ready:state.ready};
    if(!state.ready)throw new Error('Open the Presenton PC workspace');
    if(!/^[0-9a-f-]{36}$/.test(input.id))throw new Error('Invalid transfer identity');
    let t=this.transfers.get(input.id);
    if(t && t.owner!==owner)throw new Error('Unknown transfer');
    if(operation==='workspace.close'){this.close(input.id);return {closed:true};}
    if(operation==='workspace.upload'){
      if(!t){
        if(input.offset!==0 || !Number.isSafeInteger(input.size)||input.size<0||input.size>MAX_BODY||this.transfers.size>=128||[...this.transfers.values()].reduce((n,t)=>n+t.size,0)+input.size>256*1024*1024)throw new Error('Invalid upload size');
        t={owner,touched:Date.now(),size:input.size,received:0,parts:[],controller:new AbortController()};this.transfers.set(input.id,t);
      }
      if(t.started||input.offset!==t.received||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data))throw new Error('Invalid upload chunk');
      const bytes=Buffer.from(input.data,'base64');if(bytes.length>65536||t.received+bytes.length>t.size)throw new Error('Invalid upload range');
      t.parts.push(bytes);t.received+=bytes.length;t.touched=Date.now();return {received:t.received};
    }
    if(operation==='workspace.request'){
      const route=assertWorkspacePath(input.path);
      if(t?.started || (t && t.received!==t.size) || this.transfers.size>=128)throw new Error('Request is incomplete or already started');
      if(!t){t={owner,touched:Date.now(),size:0,received:0,parts:[],controller:new AbortController()};this.transfers.set(input.id,t);}
      t.started=true;t.touched=Date.now();const transfer=t;
      t.label=`${input.method} ${new URL(route,state.origin).pathname}`;
      this.transferNote=`${t.label}: awaiting the PC HTTP response`;
      const headers:Record<string,string>={'X-Presenton-Host':state.key};
      if(input.contentType)headers['Content-Type']=input.contentType;if(input.range)headers.Range=input.range;
      const body=t.size?Buffer.concat(t.parts):undefined;t.parts=[];
      // Capture this Host's origin and credential now. Never consult a later session while work is pending.
      const settings = new URL(route,state.origin).pathname === '/api/user-config' || new URL(route,state.origin).pathname === '/api/v1/ppt/business-settings';
      if(settings && input.method!=='GET') {
        transfer.response=Response.json({detail:'Configure business services and credentials in Presenton on your PC.'},{status:403});transfer.reader=transfer.response.body!.getReader();return {started:true};
      }
      void requestWorkspaceHttp(new URL(route,state.origin),{method:input.method,headers,body,signal:t.controller.signal})
        .then(async response=>{
          if(settings && response.ok){const settings=await response.json();response=Response.json(Object.fromEntries(PUBLIC_SETTINGS.filter(key=>Object.hasOwn(settings,key)).map(key=>[key,settings[key]])));}
          if(transfer.controller.signal.aborted)return;transfer.response=response;transfer.reader=response.body?.getReader();
          transfer.label+=` (${response.headers.get('content-encoding')||'identity'})`;
          this.transferNote=`${transfer.label}: HTTP ${response.status}, response ready`;
        })
        .catch(()=>{transfer.failure='The PC request failed. Check the original presentation or task before retrying; it has not been replayed.';});
      return {started:true};
    }
    if(!t||!t.started)throw new Error('Unknown presentation request');
    t.touched=Date.now();
    if(operation!=='workspace.response')throw new Error('Unknown workspace operation');
    if(t.failure)return {error:t.failure};
    if(!t.response)return {pending:true};
    if(t.reading)throw new Error('A response read is already pending');
    t.reading=true;
    this.transferNote=`${t.label}: HTTP ${t.response.status}, reading response body`;
    try{
      const response=t.response;const headers:Record<string,string>={};
      for(const name of ['content-type','content-disposition','content-range','accept-ranges']){const value=response.headers.get(name);if(value)headers[name]=value;}
      const chunk=t.pending ? {done:false,value:t.pending} : await t.reader?.read() ?? {done:true,value:undefined};
      const bytes=chunk.value?.subarray(0,131072);t.pending=chunk.value&&chunk.value.length>131072?chunk.value.subarray(131072):undefined;
      if(chunk.done){this.transferNote=`${t.label}: response delivered`;this.transfers.delete(input.id);}
      return {status:response.status,headers,done:chunk.done===true,data:bytes?Buffer.from(bytes).toString('base64'):''};
    }finally{t.reading=false;}
  }
}
