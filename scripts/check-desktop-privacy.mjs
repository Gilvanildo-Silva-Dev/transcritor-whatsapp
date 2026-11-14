import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const environment=await readFile('.env.local','utf8').catch(()=> '');
const secret=environment.match(/^\s*OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
let checked=0;
async function scan(root){for(const entry of await readdir(root,{withFileTypes:true})){const path=join(root,entry.name);if(entry.isDirectory()){assert.ok(!['dist-desktop','.desktop-build','.git'].includes(entry.name),'Build output nested in package');await scan(path);}else {assert.ok(!/^\.env(?:\.|$)/i.test(entry.name),'Environment file in package'); assert.ok(!/\.(ogg|opus|wav|mp3|m4a|webm)$/i.test(entry.name),'Audio in package'); if(/\.(js|cjs|mjs|json|html|env|asar)$/i.test(entry.name)){const text=await readFile(path,'utf8');assert.ok(!secret || secret.length<12 || !text.includes(secret),'Credential in package'); checked++;}}}}
await scan(process.argv[2] || '.desktop-build/resources');console.log(`Desktop privacy: ${checked} application/configuration files verified; no credentials, environment files or audio.`);

