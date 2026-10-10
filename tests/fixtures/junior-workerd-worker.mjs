// Local test worker only; never deploy. Admin identity injected for endpoint tests.
import {onRequestPost as create} from '../../functions/api/admin/students/index.js';
import {onRequestGet as summary} from '../../functions/api/admin/students/summary.js';
import {onRequestPost as login} from '../../functions/api/student/login.js';
import {onRequestPost as change} from '../../functions/api/student/change-password.js';
import {onRequestPost as attempts} from '../../functions/api/student/attempts.js';
import {onRequestGet as detail} from '../../functions/api/admin/students/detail.js';
const routes={'/create':create,'/login':login,'/change':change,'/attempts':attempts,'/summary':summary,'/detail':detail};
// Reproduce the hosted native-PBKDF2 limit absent from local workerd defaults.
// Kept in this local-only fixture; no authentication bypass ships to Pages.
const deriveBits=crypto.subtle.deriveBits.bind(crypto.subtle);
crypto.subtle.deriveBits=function(algorithm,...args){
 if(algorithm?.name==='PBKDF2'&&algorithm.iterations>100000)throw new DOMException('Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)','NotSupportedError');
 return deriveBits(algorithm,...args);
};
export default {async fetch(request,env){const handler=routes[new URL(request.url).pathname];return handler?handler({request,env,data:{verifiedAdminEmail:'dummy@example.test'}}):new Response('Missing',{status:404});}};
