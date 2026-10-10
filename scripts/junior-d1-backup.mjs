#!/usr/bin/env node
// Read-only remote export. Never imports/restores/deletes or touches R2/Render.
import {spawnSync} from 'node:child_process';
import {mkdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const database=process.argv[2];
if(!['up-junior-learning','up-junior-learning-pilot'].includes(database)){
 console.error('Usage: node scripts/junior-d1-backup.mjs up-junior-learning[-pilot]');process.exit(2);
}
const directory=resolve('backups');mkdirSync(directory,{recursive:true,mode:0o700});
const output=resolve(directory,database+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sql');
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler)){console.error('先に npm ci を実行してください。');process.exit(2);}
const result=spawnSync(process.execPath,[wrangler,'d1','export',database,'--remote','--output',output],{stdio:'inherit'});
if(result.status!==0){console.error('バックアップを完了できませんでした。認証とCloudflare権限を確認してください。');process.exit(result.status||1);}
chmodSync(output,0o600);
console.log('SQL backup saved. Contains credential hashes; keep private: '+output);
