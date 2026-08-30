import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const privacy = await readFile(new URL("../privacy/index.html", import.meta.url), "utf8");
const support = await readFile(new URL("../support/index.html", import.meta.url), "utf8");

test("distinguishes local setup from Google Play purchase processing", () => {
  assert.match(privacy, /on iPhone and Android/);
  assert.match(privacy, /Google Play Billing/);
  assert.match(privacy, /purchase token and purchase status/);
  assert.match(privacy, /https:\/\/policies\.google\.com\/privacy/);
  assert.match(privacy, /does not receive your payment-card details/);
  assert.match(privacy, /If you choose to share a match from Android/);
  assert.match(privacy, /both partner names and roles, the match frequency code, and sound style/);
  assert.doesNotMatch(privacy, /does not automatically collect or send personal data|Information leaves your iPhone only/);
});

test("discloses Android delivery storage and platform-specific deletion", () => {
  assert.match(privacy, /before that first unlock/);
  assert.match(privacy, /not partner names, listening answers, or custom labels/);
  assert.match(privacy, /Android cloud backup is disabled/);
  assert.match(privacy, /does not reset eligibility or cancel an existing free-month reminder/);
  for (const html of [privacy, support]) {
    assert.match(html, /Erase All Data/);
    assert.match(html, /Erase Setup &amp; Alarms/);
    assert.match(html, /free-month eligibility/i);
    assert.match(html, /Google Play purchase/);
  }
});

test("keeps Android testing separate from public availability", () => {
  assert.match(support, /Android is still in testing and is not yet available on Google Play/);
  assert.match(privacy, /does not announce its availability on Google Play/);
  assert.doesNotMatch(`${privacy}\n${support}`, /href="https:\/\/play\.google\.com\/store\/apps/);
});

test("gives separate Android permissions and real alarm-test instructions", () => {
  for (const label of ["Exact alarms", "Notifications", "Full-screen alarms", "Alarm notification channel"]) {
    assert.ok(support.includes(`<strong>${label}</strong>`), label);
  }
  assert.match(support, /force stop/);
  assert.match(support, /Settings → Alarm volume → Ring in 10 Seconds/);
  assert.match(support, /Stop test alarm/);
  assert.match(support, /media volume is separate/);
  assert.match(support, /phone locked, including Snooze and Stop/);
  assert.match(support, /<strong>iPhone:<\/strong> Free-month reminders are optional/);
  assert.match(support, /Android:<\/strong> Alarm notifications are required/);
  assert.match(support, /Settings → Free-month reminder/);
  assert.match(support, /Restore Google Play Purchase/);
});

test("describes support email and the current Android form-context limitation", () => {
  for (const html of [privacy, support]) {
    assert.match(html, /Settings → Email Support/);
    assert.match(html, /iOS or Android versions?/);
  }
  assert.match(privacy, /current form does not automatically attach that Android context/);
  assert.match(privacy, /opening the composer does not send it/);
});

test("keeps privacy section links valid", () => {
  for (const [, target] of privacy.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(privacy.includes(`id="${target}"`), target);
  }
  assert.match(privacy, /id="on-your-iphone"/); // Preserve existing external anchors.
  assert.match(privacy, /href="mailto:couplesalarm.support@gmail.com">couplesalarm.support@<wbr>gmail.com/);
});
