import assert from "node:assert/strict";
import test from "node:test";
import { buildApplication, submitApplication } from "../beta/android/signup.js";
import { handleRequest, parseApplication } from "../supabase/functions/submit-android-beta-application/index.ts";

const valid = {
  playEmail:" Test@Example.com ", phoneModel:" Test Android phone ", androidVersion:" Not sure ",
  canTest14Days:"yes", adultConfirmed:true, contactConsent:true, interests:["sharing_a_room"], website:"",
};
const values = { SUPABASE_URL:"https://example.supabase.co", SUPABASE_ANON_KEY:"public-test-key", SUPABASE_SERVICE_ROLE_KEY:"server-test-key" };
const getEnv = (name) => values[name];
function request(body = valid, headers = {}, method = "POST") {
  return new Request("https://example.supabase.co/functions/v1/submit-android-beta-application", {
    method, headers:{origin:"https://couplesalarm.com", "content-type":"application/json", apikey:"public-test-key", authorization:"Bearer public-test-key", ...headers},
    ...(method === "POST" ? {body:typeof body === "string" ? body : JSON.stringify(body)} : {}),
  });
}
const mustNotFetch = async () => { throw new Error("Unexpected database access"); };

test("normalizes the application and records consent without trusting extra fields", () => {
  const application = parseApplication({...valid, source:"attacker", contact_consent:false, secret:"ignored"});
  assert.equal(application.play_email, "test@example.com");
  assert.equal(application.phone_model, "Test Android phone");
  assert.equal(application.android_version, "Not sure");
  assert.equal(application.contact_consent, true);
  assert.equal(application.source, "website_android_beta_v1");
  assert.equal(application.consent_version, "android_beta_website_v1");
  assert.ok(!("secret" in application));
  assert.equal(parseApplication({...valid, canTest14Days:"no", interests:[]}).can_test_14_days, false);
});

test("requires real age confirmation, contact consent, device details and valid email", async () => {
  for (const change of [
    {adultConfirmed:false}, {adultConfirmed:"true"}, {contactConsent:false}, {contactConsent:undefined},
    {playEmail:"invalid"}, {phoneModel:" "}, {androidVersion:" "}, {canTest14Days:""},
    {interests:["marketing"]}, {interests:["sharing_a_room","sharing_a_room"]}, {phoneModel:"x".repeat(121)},
  ]) {
    const response = await handleRequest(request({...valid,...change}), getEnv, mustNotFetch);
    assert.equal(response.status, 400, JSON.stringify(change));
  }
});

test("rejects other origins before reading or writing application data", async () => {
  assert.equal((await handleRequest(request(valid,{origin:"https://elsewhere.example"}),getEnv,mustNotFetch)).status,403);
});

test("rejects malformed, non-JSON and oversized requests without writing", async () => {
  assert.equal((await handleRequest(request("{"),getEnv,mustNotFetch)).status,400);
  assert.equal((await handleRequest(request(valid,{"content-type":"text/plain"}),getEnv,mustNotFetch)).status,415);
  assert.equal((await handleRequest(request({...valid,website:"x".repeat(5000)}),getEnv,mustNotFetch)).status,413);
  assert.equal((await handleRequest(request(valid,{},"GET"),getEnv,mustNotFetch)).status,405);
});

test("allows browser preflight and silently ignores the hidden bot field", async () => {
  const preflight = await handleRequest(request(valid,{},"OPTIONS"),getEnv,mustNotFetch);
  assert.equal(preflight.status,204);
  assert.match(preflight.headers.get("access-control-allow-headers"),/authorization/);
  const response = await handleRequest(request({...valid,website:"spam"}),getEnv,mustNotFetch);
  assert.equal(response.status,202);
  assert.deepEqual(await response.json(),{ok:true});
});

test("writes validated fields privately and does not expose or overwrite existing applications", async () => {
  let called = 0;
  const response = await handleRequest(request(),getEnv,async (url,options) => {
    called += 1;
    assert.equal(url.searchParams.get("on_conflict"),"play_email");
    assert.equal(options.headers.Prefer,"resolution=ignore-duplicates,return=minimal");
    assert.equal(options.headers.apikey,"server-test-key");
    const row = JSON.parse(options.body);
    assert.equal(row.play_email,"test@example.com");
    assert.equal(row.adult_confirmed,true);
    assert.equal(row.contact_consent,true);
    return new Response(null,{status:201});
  });
  assert.equal(called,1);
  assert.equal(response.status,202);
  assert.deepEqual(await response.json(),{ok:true});
});

test("never reports success when persistence or server configuration fails", async () => {
  const failed = await handleRequest(request(),getEnv,async () => new Response("Database error",{status:500}));
  assert.equal(failed.status,500);
  assert.deepEqual(await failed.json(),{ok:false,error:"Application could not be recorded"});
  assert.equal((await handleRequest(request(),() => undefined,mustNotFetch)).status,500);
});

test("serializes only submitted signup fields and sends them to the website backend", async () => {
  const data = new FormData();
  for (const [name,value] of Object.entries({playEmail:" TEST@EXAMPLE.COM ",phoneModel:" Phone ",androidVersion:" 15 ",canTest14Days:"yes",adultConfirmed:"on",contactConsent:"on"})) data.append(name,value);
  data.append("interests","sharing_a_room");
  const application = buildApplication(data);
  assert.equal(application.playEmail,"test@example.com");
  assert.equal(application.adultConfirmed,true);
  await submitApplication(application,async (url,options) => {
    assert.match(url,/\/submit-android-beta-application$/);
    assert.equal(JSON.parse(options.body).phoneModel,"Phone");
    assert.ok(options.headers.apikey.startsWith("eyJ"));
    return new Response(JSON.stringify({ok:true}),{status:202});
  });
});

test("client treats network, invalid JSON and unsuccessful saves as failures", async () => {
  for (const response of [new Response(JSON.stringify({ok:false}),{status:500}),new Response("not JSON",{status:502})]) {
    await assert.rejects(submitApplication(valid,async () => response));
  }
  await assert.rejects(submitApplication(valid,async () => {throw new Error("offline");}));
});
