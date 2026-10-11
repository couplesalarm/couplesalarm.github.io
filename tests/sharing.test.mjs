import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const script = await readFile(new URL("../assets/share.js", import.meta.url), "utf8");
function setup(navigator = {}) {
  let click;
  const button = { hidden: true, addEventListener(_, fn) { click = fn; } };
  const input = { focused: false, selected: false, focus() { this.focused = true; }, select() { this.selected = true; } };
  const status = { textContent: "" };
  const elements = { "[data-share-button]": button, "[data-share-link]": input, "[data-share-status]": status };
  vm.runInNewContext(script, { document: { querySelector: selector => elements[selector] }, navigator });
  return { button, input, status, click: () => click() };
}

test("sharing waits for a visitor click and sends only the canonical public link", async () => {
  const sent = [];
  const page = setup({ share: async data => sent.push(data) });
  assert.equal(page.button.hidden, false);
  assert.equal(sent.length, 0);
  await page.click();
  assert.equal(sent[0].url, "https://couplesalarm.com/download/");
  assert.doesNotMatch(JSON.stringify(sent), /ct=|email=|referrer|response/);
});

test("cancelling native sharing does not copy or claim a message was sent", async () => {
  let copied = false;
  const page = setup({ share: async () => { throw { name: "AbortError" }; }, clipboard: { writeText: async () => { copied = true; } } });
  await page.click();
  assert.equal(copied, false);
  assert.equal(page.status.textContent, "");
});

test("unsupported sharing copies the public link and blocked clipboard offers manual copy", async () => {
  let copied;
  const page = setup({ clipboard: { writeText: async text => { copied = text; } } });
  await page.click();
  assert.equal(copied, "https://couplesalarm.com/download/");
  assert.match(page.status.textContent, /Link copied/);
  const blocked = setup({ clipboard: { writeText: async () => { throw Error("blocked"); } } });
  await blocked.click();
  assert.equal(blocked.input.selected, true);
  assert.match(blocked.status.textContent, /Select and copy/);
});
