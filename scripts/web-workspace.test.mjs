import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PresentonWebWorkspace, assertWorkspacePath } from '../electron/nimi/web-workspace.ts';
import {
  fetchFromWorkspace,
  installInPageWorkspaceBridge,
  isBusinessWorkspacePath,
  parseSseFrames,
  resolveWorkspaceRoute,
} from '../servers/nextjs/lib/web-workspace.ts';

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
    const imageTestId=randomUUID();await workspace.dispatch('consumer-one','workspace.request',{id:imageTestId,path:'/api/v1/ppt/images/test',method:'POST'});
    assert.equal((await workspace.dispatch('consumer-one','workspace.response',{id:imageTestId})).status,403);assert.equal(requests,2);
  }finally{workspace.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('in-page Web workspace bridge routes business fetch and SSE without intercepting coordination or static bundle assets', async () => {
  assert.equal(isBusinessWorkspacePath('/api/v1/ppt/presentation/all'), true);
  assert.equal(isBusinessWorkspacePath('/app_data/images/slide.png'), true);
  assert.equal(isBusinessWorkspacePath('/static/icons/bold/star-bold.svg'), true);
  assert.equal(isBusinessWorkspacePath('/api/runtime-access/session'), false);
  assert.equal(isBusinessWorkspacePath('/api/auth/runtime-clients/callback'), false);
  assert.equal(isBusinessWorkspacePath('/_releases/0.9.12/assets/index.js'), false);

  assert.equal(resolveWorkspaceRoute('/api/v1/ppt/presentation/all?limit=10', 'https://presenton.nimi.xyz'), '/api/v1/ppt/presentation/all?limit=10');
  assert.equal(resolveWorkspaceRoute('http://127.0.0.1:41234/app_data/images/slide.png', 'https://presenton.nimi.xyz'), '/app_data/images/slide.png');
  assert.equal(resolveWorkspaceRoute('/api/runtime-access/session', 'https://presenton.nimi.xyz'), null);
  assert.equal(resolveWorkspaceRoute('https://evil.example/app_data/images/slide.png', 'https://presenton.nimi.xyz'), null);

  const sseStream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode('event: response\ndata: {"type":"status","status":"Generating"}\n\n'));
      controller.enqueue(enc.encode('event: response\ndata: {"type":"complete"}\n\n'));
      controller.close();
    },
  });
  const frames = [];
  for await (const frame of parseSseFrames(sseStream)) frames.push(frame);
  assert.deepEqual(frames, [
    { event: 'response', data: '{"type":"status","status":"Generating"}', id: '' },
    { event: 'response', data: '{"type":"complete"}', id: '' },
  ]);

  const seen = [];
  const transport = {
    dispose() {},
    handleRequest(input, port) {
      seen.push(input);
      if (input.path.startsWith('/api/v1/ppt/outlines/stream/')) {
        const bytes = new TextEncoder().encode('event: response\ndata: {"type":"complete"}\n\n');
        port.postMessage({ status: 200, headers: { 'content-type': 'text/event-stream' }, done: true, bytes: bytes.buffer }, [bytes.buffer]);
        port.close();
        return;
      }
      const bodyText = input.body ? Buffer.from(input.body).toString('utf8') : '';
      const bytes = new TextEncoder().encode(JSON.stringify({ echoed: bodyText, path: input.path }));
      port.postMessage({ status: 200, headers: { 'content-type': 'application/json' }, done: true, bytes: bytes.buffer }, [bytes.buffer]);
      port.close();
    },
  };

  const originalFetch = globalThis.fetch;
  let passthroughCalls = 0;
  globalThis.fetch = async (url) => {
    passthroughCalls++;
    return new Response(JSON.stringify({ passthrough: String(url) }), { status: 200 });
  };
  const abort = new AbortController();
  const uninstall = installInPageWorkspaceBridge(transport, abort.signal, 'https://presenton.nimi.xyz');
  try {
    const coord = await fetch('https://presenton.nimi.xyz/api/runtime-access/session');
    assert.equal(passthroughCalls, 1);
    assert.deepEqual(await coord.json(), { passthrough: 'https://presenton.nimi.xyz/api/runtime-access/session' });

    const biz = await fetch('https://presenton.nimi.xyz/api/v1/ppt/presentation/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":"Updated"}',
    });
    assert.equal(passthroughCalls, 1);
    assert.deepEqual(await biz.json(), { echoed: '{"title":"Updated"}', path: '/api/v1/ppt/presentation/update' });

    const ssePayload = await new Promise((resolve, reject) => {
      const es = new globalThis.EventSource('https://presenton.nimi.xyz/api/v1/ppt/outlines/stream/123');
      es.addEventListener('response', (ev) => {
        es.close();
        resolve(JSON.parse(ev.data));
      });
      es.onerror = () => reject(new Error('unexpected SSE error'));
    });
    assert.deepEqual(ssePayload, { type: 'complete' });
    assert.equal(seen.length, 2);
  } finally {
    uninstall();
    globalThis.fetch = originalFetch;
  }
});
