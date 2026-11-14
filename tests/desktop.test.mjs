import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const {authorized,isSameOrigin,validTheme}=createRequire(import.meta.url)('../desktop/security.cjs');
test('desktop: exige token e host corretos sem falhar com Unicode',()=>{
 const origin='http://127.0.0.1:3210';
 const request=(token,host='127.0.0.1:3210')=>({headers:{'x-transcritor-desktop-token':token,host}});
 assert.equal(authorized(request('secret'),'secret',origin),true);
 for(const value of [undefined,'','wrong!','éééééé']) assert.equal(authorized(request(value),'secret',origin),false);
 assert.equal(authorized(request('secret','evil.test'),'secret',origin),false);
});
test('desktop: restringe origem e valores de tema',()=>{
 const origin='http://127.0.0.1:3210';
 assert.equal(isSameOrigin(origin+'/api/health',origin),true);
 for(const url of ['https://example.com','file:///test','http://user@127.0.0.1:3210','http://127.0.0.1:3211']) assert.equal(isSameOrigin(url,origin),false);
 assert.equal(validTheme('dark'),'dark'); assert.equal(validTheme('unknown'),'system');
});

import {registerDesktopJob} from '../src/server/audio/desktop-lifecycle.ts';
test('desktop: acompanha trabalhos para cancelar e liberar no encerramento',()=>{
 const previous=process.env.TRANSCRITOR_DESKTOP_RUNTIME;
 try {
  delete process.env.TRANSCRITOR_DESKTOP_RUNTIME;
  assert.equal(registerDesktopJob(),null);
  process.env.TRANSCRITOR_DESKTOP_RUNTIME='1';
  const first=registerDesktopJob(),second=registerDesktopJob();
  assert.equal(process.__transcritorDesktopJobs.size,2);
  for(const controller of process.__transcritorDesktopJobs)controller.abort();
  assert.equal(first.signal.aborted,true); assert.equal(second.signal.aborted,true);
  first.finish(); second.finish(); assert.equal(process.__transcritorDesktopJobs.size,0);
 } finally { if(previous===undefined)delete process.env.TRANSCRITOR_DESKTOP_RUNTIME;else process.env.TRANSCRITOR_DESKTOP_RUNTIME=previous; }
});
