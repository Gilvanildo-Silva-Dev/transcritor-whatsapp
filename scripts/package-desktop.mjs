import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
const audit=spawnSync(process.execPath,['scripts/check-desktop-privacy.mjs'],{stdio:'inherit',windowsHide:true});
if(audit.error || audit.status!==0) throw new Error('O pacote nao passou na auditoria de privacidade.');
const child=spawn(process.execPath,[join('node_modules','electron-builder','cli.js'),'--config','electron-builder.config.cjs','--win','nsis','portable','--publish','never'],{stdio:'inherit',windowsHide:true,env:{...process.env,NODE_USE_SYSTEM_CA:'1',CSC_IDENTITY_AUTO_DISCOVERY:'false',ELECTRON_CACHE:join(process.cwd(),'.local-cache','electron')}});
child.once('error',()=>{console.error('Falha ao iniciar o empacotador desktop.');process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
