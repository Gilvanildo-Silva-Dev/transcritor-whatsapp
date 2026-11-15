import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
const audit = spawnSync(process.execPath, ['scripts/check-desktop-privacy.mjs'], {stdio:'inherit', windowsHide:true});
if (audit.error || audit.status !== 0) throw new Error('O pacote nao passou na auditoria de privacidade.');
const environment = {...process.env, NODE_USE_SYSTEM_CA:'1', CSC_IDENTITY_AUTO_DISCOVERY:'false', ELECTRON_CACHE:join(process.cwd(),'.local-cache','electron')};
function build(args) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[join('node_modules','electron-builder','cli.js'),'--config','electron-builder.config.cjs',...args,'--publish','never'],{stdio:'inherit',windowsHide:true,env:environment});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Falha ao gerar executavel desktop.')));
 });
}
try {
 await build(['--win','nsis']);
 // A versao portatil evita a segunda compressao pesada do NSIS e seu timeout fixo.
 await build(['--prepackaged','dist-desktop/win-unpacked','--win','portable','--config.compression=store']);
} catch {console.error('Falha ao gerar os pacotes desktop. Verifique a etapa indicada acima.');process.exitCode=1;}
