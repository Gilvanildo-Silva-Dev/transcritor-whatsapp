import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const profile = await mkdtemp(join(tmpdir(), 'transcritor-desktop-test-'));
const audio = join(profile, 'synthetic.wav');
const env = {...process.env, TRANSCRITOR_DESKTOP_TEST:'1', TRANSCRITOR_DESKTOP_PROFILE:profile};
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Add-Type -AssemblyName System.Speech; $v=New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $v.SelectVoice('Microsoft Maria Desktop'); $v.SetOutputToWaveFile($env:DESKTOP_TEST_AUDIO); $v.Speak('Este aplicativo permite transcrever gratuitamente os arquivos de áudio no computador. Podemos copiar o texto e salvar a transcrição.'); } finally { $v.Dispose() }`],{env:{...env, DESKTOP_TEST_AUDIO:audio},windowsHide:true,timeout:60000});
 const options = {args: process.env.DESKTOP_TEST_EXECUTABLE ? [] : ['desktop/main.cjs'], env, timeout:60000, ...(process.env.DESKTOP_TEST_EXECUTABLE ? {executablePath:process.env.DESKTOP_TEST_EXECUTABLE} : {})};
 app = await electron.launch(options);
 const page = await app.firstWindow({timeout:60000}); page.setDefaultTimeout(30000);
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Transcrever áudio',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 assert.equal(await page.evaluate(()=>window.transcritorDesktop.isDesktop),true);
 assert.equal((await fetch(page.url()+'api/health')).status,403);
 assert.equal(await page.evaluate(async()=> (await fetch('/api/health')).status),200);
 // Mock only the operating-system dialog response; keep IPC, disk reading and transcription real.
 await app.evaluate(({dialog, app}, path) => {
   dialog.showOpenDialog = async (_parent, options) => {
     if (options.defaultPath !== app.getPath('desktop') || options.properties.join(',') !== 'openFile') throw new Error('Invalid native picker options');
     return {canceled:false,filePaths:[path]};
   };
 }, audio);
 await page.getByRole('button',{name:'Selecionar arquivo',exact:true}).click();
 await page.getByText('synthetic.wav',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Transcrever áudio',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('textarea')?.value.length>30,{},{timeout:180000});
 await page.locator('textarea').fill('Transcrição editada no aplicativo desktop.');
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});
 await page.getByRole('button',{name:/Copiar texto/}).click({force:true});
 await page.getByText('Texto copiado', {exact:false}).waitFor({timeout:15000});
 assert.equal(await app.evaluate(async({clipboard})=>(await clipboard.readText()).includes('editada no aplicativo desktop')),true);
 const target=join(profile,'result.txt');
 await app.evaluate(({BrowserWindow},path)=>{BrowserWindow.getAllWindows()[0].webContents.session.once('will-download',(_event,item)=>item.setSavePath(path));},target);

 await page.getByRole('button',{name:/Baixar TXT/}).click({force:true});
 for(let i=0;i<100;i++){if(await readFile(target,'utf8').then(t=>t.includes('editada no aplicativo desktop')).catch(()=>false))break;await new Promise(r=>setTimeout(r,100));}
 assert.match(await readFile(target,'utf8'),/editada no aplicativo desktop/);
 await page.getByLabel('Tema visual').selectOption('dark');
 assert.equal(JSON.parse(await readFile(join(profile,'preferences.json'),'utf8')).theme,'dark');
 assert.deepEqual(errors,[]);
 await app.close(); app=null;
 app=await electron.launch(options);
 const second=await app.firstWindow({timeout:60000});
 await second.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 console.log('Desktop: janela nativa, isolamento, acesso privado, transcrição real com Python portátil, edição e tema persistente: OK.');
} finally { if(app) await app.close(); assert.ok(!relative(tmpdir(),profile).startsWith('..') && basename(profile).startsWith('transcritor-desktop-test-')); await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300}); }




