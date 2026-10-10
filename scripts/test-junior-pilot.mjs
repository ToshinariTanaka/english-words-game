import {mkdirSync} from 'node:fs';
mkdirSync('.qa',{recursive:true});
import {spawnSync} from 'node:child_process';
const run=(args)=>{const p=spawnSync(process.execPath,args,{stdio:'inherit'});if(p.status!==0)process.exit(p.status||1);};
// Build role is a generated constant. Keep the builds and their tests sequential.
run(['scripts/build-static-junior.js']);
run(['--test','--test-concurrency=1','tests/static_junior_build.test.js','tests/junior_excel_upload.test.mjs','tests/junior_student_d1.test.mjs','tests/junior_learning_management.test.mjs','tests/junior_student_sync.test.mjs','tests/junior_dashboard_ui.test.mjs','tests/junior_workerd.test.mjs']);
run(['node_modules/wrangler/bin/wrangler.js','pages','functions','build','functions','--outfile','.qa/student-functions.js']);
run(['--test','tests/junior_admin_access.test.mjs']);
// Run upload integration tests again after the admin build switches SITE_ROLE.
run(['--test','tests/junior_excel_upload.test.mjs']);
run(['node_modules/wrangler/bin/wrangler.js','pages','functions','build','functions','--outfile','.qa/admin-functions.js']);
run(['--test','tests/junior_compiled_routes.test.mjs']);
