// Optional integration check: ONLY the isolated localhost scratch database.
// Start local PG on port 55487, create work_inquiry_release_test, and apply
// tests/sql/work-inquiries.sql first. No external database URL is accepted.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { handleRequest } from '../supabase/functions/submit-work-inquiry/index.ts';
const enabled = process.env.WORK_INQUIRY_PG_TEST === '1';
const run = promisify(execFile);
async function sql(command) {
  const {stdout} = await run('psql',['-h','127.0.0.1','-p','55487','-d','work_inquiry_release_test','-Atq','-v','ON_ERROR_STOP=1','-c',command]);
  return stdout.trim();
}
const quote = text => "'" + text.replaceAll("'","''") + "'";
const env = key => ({WORK_INQUIRIES_ENABLED:'true',SUPABASE_PUBLISHABLE_KEYS:'{"default":"test-public"}',SUPABASE_URL:'https://local-db-adapter.test',SUPABASE_SERVICE_ROLE_KEY:'test-server',RESEND_API_KEY:'test-resend',WORK_INQUIRY_NOTIFICATION_TO:'bmarko@gmail.com'})[key];
let notified = 0;
async function adapter(url, options) {
  if (url === 'https://api.resend.com/emails') {notified++; return new Response('{}');}
  assert.equal(url,'https://local-db-adapter.test/rest/v1/rpc/submit_work_inquiry');
  const {submission} = JSON.parse(options.body);
  const result = await sql(`set role service_role; select public.submit_work_inquiry(${quote(JSON.stringify(submission))}::jsonb);`);
  return new Response(result,{headers:{'Content-Type':'application/json'}});
}
function attempt(email, id=crypto.randomUUID()) {
  return handleRequest(new Request('https://local-db-adapter.test/inquiry',{
    method:'POST', headers:{origin:'https://couplesalarm.com',apikey:'test-public','content-type':'application/json','x-forwarded-for':crypto.randomUUID()},
    body:JSON.stringify({id,name:'Synthetic',email,category:'creator',channelUrl:'',audience:'',idea:'Local quota test'})
  }),env,adapter);
}
async function seed(count, reservations) {
  await sql(`truncate public.couples_alarm_work_inquiries; insert into public.couples_alarm_work_inquiries(id,name,email,category,idea,notice_version,notification_reserved) select gen_random_uuid(),'Seed','seed-'||i||'@example.com','creator','Seed','work_inquiry_v1',i<=${reservations} from generate_series(1,${count}) i;`);
  notified=0;
}
test('real PostgreSQL serializes concurrent forged-Origin requests with fresh UUIDs', {skip:!enabled}, async () => {
  await seed(0,0);
  const results=await Promise.all(Array.from({length:12},()=>attempt('same@example.com')));
  assert.equal(results.filter(r=>r.status===201).length,5);
  assert.equal(results.filter(r=>r.status===429).length,7);
  assert.equal(await sql('select count(*) from public.couples_alarm_work_inquiries'),'5');
  assert.equal(notified,5);

  await seed(99,25);
  const global=await Promise.all(Array.from({length:8},(_,i)=>attempt(`different-${i}@example.com`)));
  assert.equal(global.filter(r=>r.status===201).length,1);
  assert.equal(global.filter(r=>r.status===429).length,7);
  assert.equal(notified,0);
  assert.equal(await sql('select count(*) from public.couples_alarm_work_inquiries'),'100');

  await seed(24,24);
  const capped=await Promise.all(Array.from({length:8},(_,i)=>attempt(`notification-${i}@example.com`)));
  assert.ok(capped.every(r=>r.status===201));
  assert.equal(notified,1);
  assert.equal(await sql('select count(*) from public.couples_alarm_work_inquiries'),'32');
  assert.equal(await sql('select count(*) from public.couples_alarm_work_inquiries where notification_reserved'),'25');
  const reference=(await capped[0].json()).reference;
  assert.equal((await attempt('notification-0@example.com',reference)).status,200);
  assert.equal(notified,1);
});
