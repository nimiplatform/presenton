import { request } from 'node:http';
import { PassThrough, Readable, pipeline } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

/** The response is consumed over multiple Integration calls. Use Node's HTTP
 * stream: this Host's bundled undici asserts when a peer ends a paused parser. */
export function requestWorkspaceHttp(url:URL, input:{method:string;headers:Record<string,string>;body?:Buffer;signal:AbortSignal}):Promise<Response> {
  return new Promise((resolve,reject)=>{
    const pending=request(url,{method:input.method,headers:{...input.headers,'Accept-Encoding':'identity'},signal:input.signal},incoming=>{
      try {
        const headers=new Headers();
        for(const [name,values] of Object.entries(incoming.headers)){
          if(values===undefined)continue;
          for(const value of Array.isArray(values)?values:[values])headers.append(name,value);
        }
        const status=incoming.statusCode??502;
        const hasBody=input.method!=='HEAD' && ![204,205,304].includes(status);
        let stream:Readable=incoming;
        const encodings=(incoming.headers['content-encoding']||'identity').split(',').map(value=>value.trim().toLowerCase()).filter(value=>value&&value!=='identity').reverse();
        if(hasBody&&encodings.length){
          const decoders=encodings.map(encoding=>{
            if(encoding==='gzip')return createGunzip();
            if(encoding==='deflate')return createInflate();
            if(encoding==='br')return createBrotliDecompress();
            throw new Error(`Unsupported PC content encoding: ${encoding}`);
          });
          const decoded=new PassThrough({highWaterMark:131072});
          pipeline([incoming,...decoders,decoded],error=>{if(error)decoded.destroy(error);});
          stream=decoded;
        }
        const body=hasBody?Readable.toWeb(stream,{strategy:{highWaterMark:131072,size:(chunk:Uint8Array)=>chunk.byteLength}}):null;
        if(!hasBody)incoming.resume();
        resolve(new Response(body as ReadableStream<Uint8Array>|null,{status,headers}));
      }catch(error){incoming.destroy();reject(error);}
    });
    pending.once('error',reject);
    pending.end(input.body);
  });
}
