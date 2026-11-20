import { registerPlugin } from '@capacitor/core';
const files = registerPlugin<{
  beginExport(input:{name:string}):Promise<{id:string}>;
  appendExport(input:{id:string;offset:number;data:string}):Promise<{received:number}>;
  saveExport(input:{id:string}):Promise<{bytesWritten:number;name:string}>;
  abortExport(input:{id:string}):Promise<void>;
}>('PresentonFiles');

/** Complete the PC transfer before opening Android's picker, which backgrounds the Runtime session. */
export async function saveAndroidExport(response:Response,name:string,signal:AbortSignal) {
  signal.throwIfAborted();
  if(!response.ok || !response.body)throw new Error('The exported file could not be transferred from the PC.');
  const {id}=await files.beginExport({name});const reader=response.body.getReader();let offset=0;
  try {
    for(;;){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;
      for(let start=0;start<value.length;start+=65536){const bytes=value.subarray(start,start+65536);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
        const result=await files.appendExport({id,offset,data:btoa(text)});offset+=bytes.length;if(result.received!==offset)throw new Error('The Android export transfer was incomplete.');}
    }
    signal.throwIfAborted();
    const result=await files.saveExport({id});if(result.bytesWritten!==offset)throw new Error('The file was not completely saved.');
  }catch(error){await files.abortExport({id}).catch(()=>undefined);throw error;}
  finally{reader.releaseLock();}
}
