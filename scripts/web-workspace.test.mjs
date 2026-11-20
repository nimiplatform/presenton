import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PresentonWebWorkspace, assertWorkspacePath } from '../electron/nimi/web-workspace.ts';

test('Web workspace admits business routes and rejects arbitrary network, Runtime and provider access',()=>{
  for(const value of ['/api/v1/ppt/presentation/all','/api/v1/ppt/generation/stream?id=one','/api/v1/ppt/fonts/upload','/api/export-presentation/file?name=deck.pptx','/app_data/images/example.png'])assert.equal(assertWorkspacePath(value),value);
  for(const value of ['http://localhost/api/v1/ppt/presentation/all','//localhost/api/v1/ppt/presentation/all','/api/runtime-access/session','/api/v1/ppt/openai/models','/api/v1/admin/api-keys','/app_data/%2e%2e%2fsecret','/api/v1/ppt/\\secret'])assert.throws(()=>assertWorkspacePath(value));
});

test('PC transfer preserves binary chunks, scopes objects to the real consumer and rejects duplicate active requests',async()=>{
  const source=Buffer.alloc(1024*1024+123);for(let i=0;i<source.length;i++)source[i]=i%251;
  let requests=0,received;
  const server=createServer(async(req,res)=>{
    requests++;assert.equal(req.headers['x-presenton-host'],'private-pc-key');
    const pieces=[];for await(const piece of req)pieces.push(piece);received=Buffer.concat(pieces);
    if(req.url==='/api/user-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({IMAGE_PROVIDER:'nimi',PEXELS_API_KEY:'test-private-key',SEARXNG_BASE_URL:'https://private.example/?token=test-secret',FUTURE_SECRET:'test-secret'}));return;}
    res.setHeader('Content-Type','application/octet-stream');res.setHeader('Set-Cookie','never-copy=this');res.end(source);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const services={integration:{registerProvider:async()=>({targetRef:'test'}),pollProvider:()=>new Promise(()=>{}),unregisterProvider:async()=>({})}};
  const workspace=new PresentonWebWorkspace(services,()=>({ready:true,key:'private-pc-key',origin:`http://127.0.0.1:${server.address().port}`}));
  try{
    const id=randomUUID();
    for(let offset=0;offset<source.length;offset+=65536)await workspace.dispatch('consumer-one','workspace.upload',{id,size:source.length,offset,data:source.subarray(offset,offset+65536).toString('base64')});
    await assert.rejects(workspace.dispatch('consumer-two','workspace.request',{id,path:'/api/v1/ppt/files/upload',method:'POST'}));
    await workspace.dispatch('consumer-one','workspace.request',{id,path:'/api/v1/ppt/files/upload',method:'POST',contentType:'application/octet-stream'});
    await assert.rejects(workspace.dispatch('consumer-one','workspace.request',{id,path:'/api/v1/ppt/files/upload',method:'POST'}));
    await assert.rejects(workspace.dispatch('consumer-two','workspace.response',{id}));
    const pieces=[];
    for(;;){const chunk=await workspace.dispatch('consumer-one','workspace.response',{id});if(chunk.pending){await new Promise(resolve=>setTimeout(resolve,5));continue;}
      assert.equal(chunk.status,200);assert.equal(chunk.headers['set-cookie'],undefined);assert.ok(chunk.data.length<256*1024);pieces.push(Buffer.from(chunk.data,'base64'));if(chunk.done)break;}
    assert.deepEqual(Buffer.concat(pieces),source);assert.deepEqual(received,source);assert.equal(requests,1);
    await assert.rejects(workspace.dispatch('consumer-one','workspace.response',{id}));
    const settingsId=randomUUID();await workspace.dispatch('consumer-one','workspace.request',{id:settingsId,path:'/api/user-config',method:'GET'});
    const settingsParts=[];
    for(;;){const chunk=await workspace.dispatch('consumer-one','workspace.response',{id:settingsId});if(chunk.pending){await new Promise(resolve=>setTimeout(resolve,5));continue;}settingsParts.push(Buffer.from(chunk.data,'base64'));if(chunk.done)break;}
    assert.deepEqual(JSON.parse(Buffer.concat(settingsParts).toString()),{IMAGE_PROVIDER:'nimi'});
    const blockedId=randomUUID();await workspace.dispatch('consumer-one','workspace.request',{id:blockedId,path:'/api/user-config',method:'POST'});
    assert.equal((await workspace.dispatch('consumer-one','workspace.response',{id:blockedId})).status,403);assert.equal(requests,2);
  }finally{workspace.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
