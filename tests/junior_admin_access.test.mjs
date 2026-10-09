import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { accessConfig, verifyAccessJWT } from '../cloudflare/admin-access-auth.js';
import { rejectUnauthenticatedAdminMutation } from '../cloudflare/admin-mutation-guard.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { adminHTML, adminJS, build } from '../scripts/build-junior-admin.js';

const team='https://up-juku.cloudflareaccess.com';
const aud='1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const mail='operator@example.com';
const config=accessConfig({CF_ACCESS_TEAM_DOMAIN:team,CF_ACCESS_AUD:aud,ADMIN_ALLOWED_EMAILS:mail});
const base='https://admin.pages.dev';

async function signedJWT(overrides={},changeSigningKey=null) {
  const pair=await crypto.subtle.generateKey({
    name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256',
  },true,['sign','verify']);
  const pub=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const kid='test-jwk-kid';
  const h=Buffer.from(JSON.stringify({alg:'RS256',kid,typ:'JWT'})).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const p=Buffer.from(JSON.stringify({
    iss:team,aud:[aud],email:mail,sub:'test-subject',iat:now-10,exp:now+3600,...overrides,
  })).toString('base64url');
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5', changeSigningKey || pair.privateKey,
    new TextEncoder().encode(h+'.'+p));
  const token=h+'.'+p+'.'+Buffer.from(sig).toString('base64url');
  const fetchJwks=async(url)=>({
    ok:url===team+'/cdn-cgi/access/certs',
    json:async()=>({keys:[{...pub,kid,alg:'RS256',use:'sig'}]}),
  });
  return {token,fetchJwks};
}
function accessRequest(token='') {
  return new Request(base+'/',{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}});
}

test('admin project build contains no upload token and protects every path',()=>{
  const root=path.resolve(import.meta.dirname,'..');
  const inputHTML=fs.readFileSync(path.join(root,'admin/junior-data/index.html'),'utf8');
  const inputJS=fs.readFileSync(path.join(root,'admin/junior-data/script.js'),'utf8');
  build();
  assert.equal(fs.readFileSync(path.join(root,'admin/junior-data/index.html'),'utf8'),inputHTML);
  assert.equal(fs.readFileSync(path.join(root,'admin/junior-data/script.js'),'utf8'),inputJS);
  const out=path.join(root,'dist-junior-admin');
  const html=fs.readFileSync(path.join(out,'index.html'),'utf8');
  const js=fs.readFileSync(path.join(out,'script.js'),'utf8');
  assert.doesNotMatch(html, /id="token"|管理者専用トークン/);
  assert.doesNotMatch(js, /['"]Authorization['"]|Bearer |getElementById\(['"]token['"]\)|\$\(['"]token['"]\)/);
  assert.match(html,/64文字の認証キーの入力は不要/);
  assert.match(html,/https:\/\/up-junior-words-preview\.pages\.dev\//);
  assert.doesNotThrow(()=>new vm.Script(js.replace(/^import [^\n]+\n/,''),
    {filename:'admin-script.js'}));
  const routes=JSON.parse(fs.readFileSync(path.join(out,'_routes.json'),'utf8'));
  assert.deepEqual(routes,{version:1,include:['/*'],exclude:[]});
  assert.equal(fs.existsSync(path.join(out,'parser.mjs')),true);
  assert.throws(()=>adminJS('broken'),/source drift/);
  assert.throws(()=>adminHTML('broken'),/source drift/);
});

test('rejects incomplete Access configuration rather than falling back to public access',()=>{
  assert.equal(accessConfig({}),null);
  assert.equal(accessConfig({CF_ACCESS_TEAM_DOMAIN:'http://up-juku.cloudflareaccess.com',
    CF_ACCESS_AUD:aud,ADMIN_ALLOWED_EMAILS:mail}),null);
  assert.equal(accessConfig({CF_ACCESS_TEAM_DOMAIN:team,CF_ACCESS_AUD:aud,
    ADMIN_ALLOWED_EMAILS:'*@example.com'}),null);
  assert.equal(accessConfig({CF_ACCESS_TEAM_DOMAIN:team,CF_ACCESS_AUD:aud,
    ADMIN_ALLOWED_EMAILS:mail})?.allowedEmails.has(mail),true);
});

test('validates a genuine signed Cloudflare Access-style JWT',async()=>{
  const {token,fetchJwks}=await signedJWT();
  const identity=await verifyAccessJWT(accessRequest(token),config,fetchJwks);
  assert.equal(identity?.email,mail);
  assert.equal(identity?.subject,'test-subject');
});

test('accepts cryptographically verified Access cookie if JWT assertion header is absent',async()=>{
  const {token,fetchJwks}=await signedJWT();
  const req=new Request(base+'/',{headers:{Cookie:'other=value; CF_Authorization='+token}});
  assert.equal((await verifyAccessJWT(req,config,fetchJwks))?.email,mail);
  const forged=new Request(base+'/',{headers:{Cookie:'CF_Authorization='+token.slice(0,-2)+'aa'}});
  assert.equal(await verifyAccessJWT(forged,config,fetchJwks),null);
});

test('blocks untrusted identity, signature, issuer, audience and expired JWT',async()=>{
  let v=await signedJWT({email:'somebody@example.com'});
  assert.equal(await verifyAccessJWT(accessRequest(v.token),config,v.fetchJwks),null);
  v=await signedJWT({iss:'https://attacker.cloudflareaccess.com'});
  assert.equal(await verifyAccessJWT(accessRequest(v.token),config,v.fetchJwks),null);
  v=await signedJWT({aud:['wrong-aud']});
  assert.equal(await verifyAccessJWT(accessRequest(v.token),config,v.fetchJwks),null);
  v=await signedJWT({exp:Math.floor(Date.now()/1000)-10});
  assert.equal(await verifyAccessJWT(accessRequest(v.token),config,v.fetchJwks),null);
  v=await signedJWT();
  const [jwtHeader,jwtPayload,jwtSignature]=v.token.split('.');
  const tamperedPayload=Buffer.from(JSON.stringify({iss:team,aud:[aud],email:mail,sub:'tampered',exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
  assert.equal(await verifyAccessJWT(accessRequest([jwtHeader,tamperedPayload,jwtSignature].join('.')),config,v.fetchJwks),null);
  assert.equal(await verifyAccessJWT(accessRequest(),config,v.fetchJwks),null);
});

test('missing Access JWT or settings blocks the entire admin page',async()=>{
  const deny=await middleware({request:accessRequest(),env:{
    CF_ACCESS_TEAM_DOMAIN:team,CF_ACCESS_AUD:aud,ADMIN_ALLOWED_EMAILS:mail,
  },data:{},next:()=>new Response('private content')});
  assert.equal(deny.status,403);
  const missing=await middleware({request:accessRequest(),env:{},
    data:{},next:()=>new Response('private content')});
  assert.equal(missing.status,503);
});

test('staging and publication write APIs require middleware identity and same-origin',()=>{
  const env={JUNIOR_DATA:{}};
  const valid=new Request(base+'/api/admin/questions/publish',{
    method:'POST',headers:{Origin:base,'Content-Type':'application/json'},
    body:'{}',
  });
  assert.equal(rejectUnauthenticatedAdminMutation({request:valid,env,data:{}})?.status,403);
  assert.equal(rejectUnauthenticatedAdminMutation({request:valid,env,data:{
    verifiedAdminEmail:mail,
  }}),null);
  const evil=new Request(base+'/api/admin/questions/publish',{
    method:'POST',headers:{Origin:'https://attacker.test','Content-Type':'application/json'},
    body:'{}',
  });
  assert.equal(rejectUnauthenticatedAdminMutation({
    request:evil,env,data:{verifiedAdminEmail:mail},
  })?.status,403);
});
