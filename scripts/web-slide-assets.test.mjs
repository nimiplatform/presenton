import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { inlineWebSlideAssets } from '../servers/nextjs/lib/web-slide-assets.ts';

test('sandbox asset preparation transfers actual bytes once and leaves slide text unchanged',async()=>{
  const bytes=Buffer.from([0,255,1,254,2,253]);let reads=0;
  const server=createServer((request,response)=>{reads++;response.setHeader('Content-Type','image/png');response.end(bytes);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const document='<p>Example: /app_data/image.png</p><img src="/app_data/image.png"><div style="background:url(/app_data/image.png)"></div>';
    const result=await inlineWebSlideAssets(document,origin,new AbortController().signal);
    const asset='data:image/png;base64,'+bytes.toString('base64');
    assert.equal(result,`<p>Example: /app_data/image.png</p><img src="${asset}"><div style="background:url(${asset})"></div>`);
    assert.equal(reads,1);
    await assert.rejects(inlineWebSlideAssets('<img src="https://other.example/app_data/private.png">',origin,new AbortController().signal),/different PC asset origin/);
    const aborted=new AbortController();aborted.abort();
    await assert.rejects(inlineWebSlideAssets(document,origin,aborted.signal));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
