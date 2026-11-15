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
import {mkdtemp,writeFile,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative,basename} from 'node:path';
const {chooseAudio,readSelectedAudio}=createRequire(import.meta.url)('../desktop/audio-picker.cjs');
test('desktop: seletor nativo abre Desktop e retorna apenas nome e bytes do arquivo escolhido',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'transcritor-picker-test-'));
 try {
  const path=join(directory,'voice.OPUS');await writeFile(path,Buffer.from('OggS-test'));
  const result=await chooseAudio({showOpenDialog:async(parent,options)=>{
   assert.equal(parent,'window');assert.equal(options.defaultPath,'Desktop');assert.deepEqual(options.properties,['openFile']);assert.ok(options.filters[0].extensions.includes('opus'));
   return {canceled:false,filePaths:[path]};
  }},'window','Desktop');
  assert.equal(result.file.name,'voice.OPUS');assert.deepEqual(Buffer.from(result.file.data),Buffer.from('OggS-test'));assert.equal('path' in result.file,false);
  assert.equal(await chooseAudio({showOpenDialog:async()=>({canceled:true,filePaths:[]})},'window','Desktop'),null);
 } finally {assert.ok(!relative(tmpdir(),directory).startsWith('..') && basename(directory).startsWith('transcritor-picker-test-'));await rm(directory,{recursive:true,force:true});}
});
test('desktop: rejeita tamanho, vazio, extensao e falhas de leitura sem revelar caminhos',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'transcritor-picker-test-'));
 try {
  const large=join(directory,'large.wav');const handle=await open(large,'w');await handle.truncate(25*1024*1024+1);await handle.close();
  const empty=join(directory,'empty.wav');await writeFile(empty,'');
  for(const [path,pattern] of [[large,/25 MB/],[empty,/vazio/],[join(directory,'bad.exe'),/Formato/],[join(directory,'missing.wav'),/disponível/]]){
   const result=await chooseAudio({showOpenDialog:async()=>({canceled:false,filePaths:[path]})},'window','Desktop');
   assert.match(result.error,pattern);assert.equal(result.error.includes(directory),false);
  }
  await assert.rejects(readSelectedAudio(large),/SIZE/);
 } finally {assert.ok(!relative(tmpdir(),directory).startsWith('..') && basename(directory).startsWith('transcritor-picker-test-'));await rm(directory,{recursive:true,force:true});}
});
