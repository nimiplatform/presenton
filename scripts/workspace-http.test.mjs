import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { requestWorkspaceHttp } from '../electron/nimi/workspace-http.ts';

test('HTTP responses survive connection close while the consumer pauses between chunks',async()=>{
  const data=Buffer.alloc(2*1024*1024,37);let bodyBytes=-1;
  const server=createServer(async(req,res)=>{let size=0;for await(const chunk of req)size+=chunk.length;bodyBytes=size;
    res.setHeader('Connection','close');res.setHeader('Content-Type','application/octet-stream');res.statusCode=201;res.end(data);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const result=await requestWorkspaceHttp(new URL(`http://127.0.0.1:${server.address().port}/empty-post`),{method:'POST',headers:{'Content-Type':'application/json'},signal:new AbortController().signal});
    assert.equal(result.status,201);await new Promise(resolve=>setTimeout(resolve,80));
    const reader=result.body.getReader(),parts=[];
    for(;;){const chunk=await reader.read();if(chunk.done)break;parts.push(Buffer.from(chunk.value));await new Promise(resolve=>setTimeout(resolve,2));}
    assert.deepEqual(Buffer.concat(parts),data);assert.equal(bodyBytes,0);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('compressed closing responses are decoded before the App receives their bytes',async()=>{
  const data=Buffer.alloc(1024*1024,91);
  const server=createServer((req,res)=>{assert.equal(req.headers['accept-encoding'],'identity');res.setHeader('Connection','close');res.setHeader('Content-Encoding','gzip');res.end(gzipSync(data));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const result=await requestWorkspaceHttp(new URL(`http://127.0.0.1:${server.address().port}/compressed`),{method:'GET',headers:{},signal:new AbortController().signal});
    await new Promise(resolve=>setTimeout(resolve,80));assert.deepEqual(Buffer.from(await result.arrayBuffer()),data);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
