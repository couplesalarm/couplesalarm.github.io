import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { handleRequest, parseInquiry } from '../supabase/functions/submit-work-inquiry/index.ts';
import { createSender, readInquiry, submitInquiry, attachInquiryForm } from '../work-with-us/inquiry.js';
import { inquiryEndpoint, inquiryPublicKey } from '../work-with-us/config.js';
const id = 'ad187b6d-7777-4000-8000-16b8c7531534';
const valid = { id, name: 'Example Person', email: 'example@example.com', category: 'creator', channelUrl: 'https://example.com/', audience: 'Couples with different routines', idea: 'A discussion of shared mornings.' };
const env = name => ({ WORK_INQUIRIES_ENABLED: 'true', SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({default:inquiryPublicKey}), WORK_INQUIRY_NOTIFICATION_TO:'bmarko@gmail.com', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key', RESEND_API_KEY: 'test-email-key' })[name];
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (body = valid, method = 'POST', headers = {}) => new Request('https://example.test/inquiry', { method, headers: { origin: 'https://couplesalarm.com', apikey: inquiryPublicKey, 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const noFetch = () => assert.fail('Unexpected network request');

test('inquiry page uses verified endpoint and missing configuration fails closed', async () => {
  assert.equal(inquiryEndpoint, 'https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/submit-work-inquiry');
  assert.equal((await handleRequest(request(), () => undefined, noFetch)).status, 503);
  await assert.rejects(submitInquiry('', valid, noFetch));
});

test('inquiry validation allows only the specified fields and limits', () => {
  const row = parseInquiry({ ...valid, name: ' Example Person ', health: 'not stored', idempotency: 'not stored' });
  assert.equal(row.name, 'Example Person');
  assert.deepEqual(Object.keys(row).sort(), ['id', 'name', 'email', 'category', 'channel_url', 'audience', 'idea', 'notice_version'].sort());
  for (const [field, max] of Object.entries({ name: 100, email: 254, channelUrl: 500, audience: 300, idea: 2000 })) {
    const limitValue = field === 'email' ? 'a'.repeat(max - 12) + '@example.com' : field === 'channelUrl' ? 'https://example.com/' + 'a'.repeat(max - 20) : 'a'.repeat(max);
    assert.doesNotThrow(() => parseInquiry({ ...valid, [field]: limitValue }));
    assert.throws(() => parseInquiry({ ...valid, [field]: 'a'.repeat(max + 1) }));
  }
  for (const patch of [{ name: ' ' }, { idea: '\n' }, { email: 'not email' }, { email: 'a\nb@example.com' }, { category: 'affiliate-enrolled' }, { id: 'not-uuid' }, { name: 99 }, { idea: '\0' }, { channelUrl: 'javascript:alert(1)' }, { channelUrl: 'https://user:secret@example.com' }]) {
    assert.throws(() => parseInquiry({ ...valid, ...patch }));
  }
});

test('inquiry endpoint rejects reads, other origins, invalid JSON and oversized bodies', async () => {
  for (const [req, code] of [[request(valid, 'GET'), 405], [request(valid, 'POST', { origin: 'https://other.example' }), 403], [request(valid, 'POST', { 'content-type': 'text/plain' }), 415], [request('{'), 400], [request(null), 400], [request({ ...valid, idea: 'x'.repeat(17000) }), 413]]) {
    assert.equal((await handleRequest(req, env, noFetch)).status, code);
  }
  assert.equal((await handleRequest(request(valid, 'OPTIONS'), env, noFetch)).status, 204);
});

test('stores privately before notifying, with no contact or message in the notification', async () => {
  const calls = [];
  const result = await handleRequest(request(), env, async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      assert.match(url, /rpc\/submit_work_inquiry$/);
      assert.equal(options.headers.Authorization, 'Bearer test-server-key');
      assert.deepEqual(JSON.parse(options.body), {submission: parseInquiry(valid)});
      return response({outcome:'created', reference:id, notify:true});
    }
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers['Idempotency-Key'], `work-inquiry/${id}`);
    const notification = JSON.parse(options.body);
    assert.match(notification.text, /https:\/\/supabase.com\/dashboard\/project\/xqdqgsbkapvlskcldmpe\/editor/);
    for (const value of [valid.name, valid.email, valid.idea, valid.channelUrl, valid.audience]) assert.ok(!options.body.includes(value));
    return response({ id: 'email-test' });
  });
  assert.equal(calls.length, 2);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { ok: true, reference: id });
});

test('unchanged retry returns only its reference; changed payload with same key cannot overwrite', async () => {
  for (const changed of [false, true]) {
    let calls = 0;
    const result = await handleRequest(request(changed ? { ...valid, idea: 'Different idea' } : valid), env, async (_, options) => {
      calls++;
      return response(changed ? {outcome:'conflict'} : {outcome:'duplicate',reference:id,notify:false});
    });
    assert.equal(calls, 1);
    assert.equal(result.status, changed ? 409 : 200);
    assert.doesNotMatch(await result.text(), /Example Person|example@example.com|discussion/);
  }
});

test('storage errors never report success or notify; notification failure keeps durable success', async () => {
  for (const failure of [response({ error: valid.email }, 500), response({}), response([{ id: 'wrong' }]), new Response('not JSON')]) {
    let calls = 0;
    const result = await handleRequest(request(), env, async () => { calls++; return failure; });
    assert.equal(result.status, 503);
    assert.equal(calls, 1);
    assert.doesNotMatch(await result.text(), /example@example.com/);
  }
  let calls = 0;
  const result = await handleRequest(request(), env, async () => {
    if (++calls === 1) return response({outcome:'created',reference:id,notify:true});
    throw Error('email delivery unavailable');
  });
  assert.equal(result.status, 201);
});

test('browser strips unrequested fields and keeps retries idempotent after a lost response', async () => {
  const details = readInquiry(new Map(Object.entries({ ...valid, extra: 'private' })));
  assert.equal('id' in details, false);
  assert.equal('extra' in details, false);
  const sent = [];
  let key = 0;
  const sender = createSender('https://example.test', async (_, options) => {
    sent.push(JSON.parse(options.body));
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    if (sent.length === 1) throw Error('connection lost after storing');
    return response({ ok: true, reference: sent.at(-1).id });
  }, () => key++ === 0 ? id : 'ad187b6d-7777-4000-8000-16b8c7531535');
  await assert.rejects(sender(details));
  assert.equal(await sender(details), id);
  assert.equal(sent[0].id, sent[1].id);
  await sender({ ...details, idea: 'A new inquiry' });
  assert.notEqual(sent[2].id, id);
});

test('browser rejects false, malformed or mismatched storage confirmations', async () => {
  for (const result of [response({ ok: true }), response({ ok: false, reference: id }), response({ ok: true, reference: 'other' }), response({ ok: true, reference: id }, 503), new Response('bad json')]) {
    await assert.rejects(submitInquiry('https://example.test', valid, async () => result));
  }
});

function formHarness(endpoint, fetchImpl) {
  const node = () => ({ disabled: true, hidden: false, textContent: '', events: {}, addEventListener(type, fn) { this.events[type] = fn; }, focus() { this.focused = true; }, setAttribute(key, value) { this[key] = value; } });
  const form = node();
  const submit = node();
  form.elements = Object.fromEntries(Object.entries(valid).map(([name, value]) => [name, { ...node(), value }]));
  form.reportValidity = () => true;
  form.reset = () => { form.resetCalled = true; };
  form.querySelector = () => submit;
  const nodes = { '#inquiry-form': form, '#inquiry-fields': node(), '#inquiry-status': node(), '#inquiry-error': node(), '#inquiry-availability': node() };
  const buttons = ['partnership', 'creator'].map(value => ({ ...node(), dataset: { inquiryCategory: value } }));
  attachInquiryForm({ querySelector: selector => nodes[selector], querySelectorAll: () => buttons }, endpoint, fetchImpl);
  return { form, submit, nodes, buttons, send: () => form.events.submit({ preventDefault() {} }) };
}

test('form category selection and unavailable state preserve details without requests', async () => {
  const p = formHarness('', noFetch);
  p.buttons[0].events.click();
  assert.equal(p.form.elements.category.value, 'partnership');
  assert.equal(p.form.elements.category.focused, true);
  await p.send();
  assert.match(p.nodes['#inquiry-error'].textContent, /have not been sent/);
  assert.equal(p.nodes['#inquiry-error'].focused, true);
  assert.equal(p.form.resetCalled, undefined);
});

test('form failure/retry restores controls, retains answers and only clears after durable confirmation', async () => {
  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class { constructor(form) { this.form = form; } get(name) { return this.form.elements[name]?.value; } };
  try {
    let calls = 0;
    let firstId;
    let release;
    const p = formHarness('https://example.test', async (_, options) => {
      const payload = JSON.parse(options.body);
      if (++calls === 1) { firstId = payload.id; await new Promise(resolve => { release = resolve; }); throw Error('offline'); }
      assert.equal(payload.id, firstId);
      return response({ ok: true, reference: payload.id });
    });
    const pending = p.send();
    assert.equal(p.submit.disabled, true);
    assert.equal(p.nodes['#inquiry-fields'].disabled, true);
    await p.send();
    assert.equal(calls, 1);
    release(); await pending;
    assert.equal(p.submit.disabled, false);
    assert.equal(p.form.elements.idea.value, valid.idea);
    assert.equal(p.form.resetCalled, undefined);
    assert.equal(p.nodes['#inquiry-error'].hidden, false);
    await p.send();
    assert.equal(p.form.resetCalled, true);
    assert.match(p.nodes['#inquiry-status'].textContent, /was recorded/);
    assert.equal(p.nodes['#inquiry-status'].focused, true);
  } finally { globalThis.FormData = OriginalFormData; }
});

test('page is accessible, uses approved terms and keeps inquiry data off analytics', async () => {
  const html = await readFile(new URL('../work-with-us/index.html', import.meta.url), 'utf8');
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /Offers and payment terms are agreed separately/);
  assert.match(html, /does not enroll you/);
  assert.match(html, /method="post"/);
  assert.match(html, /fieldset id="inquiry-fields" disabled/);
  assert.doesNotMatch(html, /analytics\.js|\$7\.99|\$2|type="file"/);
  const code = await readFile(new URL('../work-with-us/inquiry.js', import.meta.url), 'utf8');
  const backend = await readFile(new URL('../supabase/functions/submit-work-inquiry/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(code + backend, /console\.|localStorage|sessionStorage|sendBeacon/);
});


test('public API key authentication fails closed but permits preflight', async () => {
  for (const apikey of ['', 'wrong', 'test-server-key']) {
    assert.equal((await handleRequest(request(valid, 'POST', {apikey}), env, noFetch)).status, 401);
  }
  const malformed = key => key === 'SUPABASE_PUBLISHABLE_KEYS' ? 'bad-json' : env(key);
  assert.equal((await handleRequest(request(), malformed, noFetch)).status, 503);
  const preflight = await handleRequest(request(valid, 'OPTIONS', {apikey:''}), env, noFetch);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /apikey/);
});

test('forged allowed Origin and fresh UUIDs must still go through database quotas', async () => {
  for (const retryAfter of [3600,86400]) {
    let calls = 0;
    for (let i=0;i<3;i++) {
      const attempt = {...valid,id:crypto.randomUUID()};
      const result = await handleRequest(request(attempt, 'POST', {'x-forwarded-for':`fake-${i}`}), env, async (url,options) => {
        calls++;
        assert.match(url,/rpc\/submit_work_inquiry$/);
        assert.equal(JSON.parse(options.body).submission.id, attempt.id);
        return response({outcome:'limited',retryAfter});
      });
      assert.equal(result.status,429);
      assert.equal(result.headers.get('retry-after'),String(retryAfter));
    }
    assert.equal(calls,3); // one RPC per request, never notification or direct insert
  }
});

test('notification cap does not turn a durable save into failure', async () => {
  let calls=0;
  const result=await handleRequest(request(),env,async () => {
    calls++; return response({outcome:'created',reference:id,notify:false});
  });
  assert.equal(calls,1);
  assert.equal(result.status,201);
  assert.deepEqual(await result.json(),{ok:true,reference:id});
});

test('inquiry recipient defaults to approved bmarko inbox without changing feedback routing', async () => {
  let calls=0;
  const noRecipient=key => key==='WORK_INQUIRY_NOTIFICATION_TO' ? undefined : env(key);
  assert.equal((await handleRequest(request(),noRecipient,async (_,options) => {
    if (++calls===1) return response({outcome:'created',reference:id,notify:true});
    assert.deepEqual(JSON.parse(options.body).to,['bmarko@gmail.com']);
    return response({});
  })).status,201);
  assert.equal(calls,2);
  const support=key => key==='WORK_INQUIRY_NOTIFICATION_TO' ? 'couplesalarm.support@gmail.com' : env(key);
  calls=0;
  await handleRequest(request(),support,async (_,options) => {
    if (++calls===1) return response({outcome:'created',reference:id,notify:true});
    assert.deepEqual(JSON.parse(options.body).to,['couplesalarm.support@gmail.com']);
    return response({});
  });
  assert.equal(calls,2);
});

test('429 preserves entered details and reports no recorded inquiry', async () => {
  const OriginalFormData=globalThis.FormData;
  globalThis.FormData=class { constructor(form){this.form=form;} get(name){return this.form.elements[name]?.value;} };
  try {
    const p=formHarness('https://example.test',async () => response({ok:false},429));
    await p.send();
    assert.match(p.nodes['#inquiry-error'].textContent,/This attempt was not recorded/);
    assert.equal(p.form.resetCalled,undefined);
    assert.equal(p.submit.disabled,false);
    assert.equal(p.form.elements.idea.value,valid.idea);
  } finally {globalThis.FormData=OriginalFormData;}
});
