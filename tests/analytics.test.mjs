import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const analytics = await readFile(
  new URL("../assets/analytics.js", import.meta.url),
  "utf8",
);

const taggedPages = [
  ["../index.html", "assets/analytics.js"],
  ["../compatibility/index.html", "../assets/analytics.js"],
  ["../different-wake-times/index.html", "../assets/analytics.js"],
  ["../download/index.html", "../assets/analytics.js"],
  ["../support/index.html", "../assets/analytics.js"],
  ["../privacy/index.html", "../assets/analytics.js"],
];

const untaggedPages = [
  "../admin/index.html",
  "../growth-dashboard/index.html",
  "../beta/index.html",
  "../feedback/index.html",
];

// Runs assets/analytics.js against a stub browser and reports what it did.
const run = ({ id = "G-TEST12345", hostname = "couplesalarm.com", dnt = null } = {}) => {
  const constant = /const MEASUREMENT_ID = "[^"]*";/;
  assert.match(analytics, constant, "expected a MEASUREMENT_ID constant to patch");
  const source = analytics.replace(
    constant,
    `const MEASUREMENT_ID = ${JSON.stringify(id)};`,
  );

  const loaded = [];
  const created = [];
  const sandbox = {
    navigator: { doNotTrack: dnt },
    document: {
      createElement: () => {
        const element = { tagName: "script", async: false, src: "" };
        created.push(element);
        return element;
      },
      head: {
        appendChild: (element) => {
          loaded.push(element);
        },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.window.location = { hostname };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  return { sandbox, loaded, created, calls: (sandbox.dataLayer ?? []).map((a) => [...a]) };
};

test("points at the couplesalarm.com GA4 property", () => {
  assert.match(analytics, /const MEASUREMENT_ID = "G-3DZB7Q51CM";/);
  const { loaded } = run({ id: "G-3DZB7Q51CM" });
  assert.equal(
    loaded[0].src,
    "https://www.googletagmanager.com/gtag/js?id=G-3DZB7Q51CM",
  );
});

test("goes inert when the Measurement ID is blanked out", () => {
  const { loaded, sandbox } = run({ id: "" });
  assert.deepEqual(loaded, [], "no tag should load without a Measurement ID");
  assert.equal(sandbox.dataLayer, undefined);
  assert.equal(sandbox.gtag, undefined);
});

test("loads gtag only for the production hostnames", () => {
  for (const hostname of ["couplesalarm.com", "www.couplesalarm.com"]) {
    const { loaded } = run({ hostname });
    assert.equal(loaded.length, 1, `${hostname} should load the tag`);
    assert.equal(
      loaded[0].src,
      "https://www.googletagmanager.com/gtag/js?id=G-TEST12345",
    );
    assert.equal(loaded[0].async, true);
  }

  for (const hostname of ["localhost", "127.0.0.1", "couplesalarm.github.io", ""]) {
    const { loaded } = run({ hostname });
    assert.deepEqual(loaded, [], `${hostname} must stay out of the property`);
  }
});

test("honors Do Not Track by sending nothing at all", () => {
  for (const dnt of ["1", "yes"]) {
    const { loaded, sandbox } = run({ dnt });
    assert.deepEqual(loaded, [], `doNotTrack=${dnt} must send no request`);
    assert.equal(sandbox.dataLayer, undefined);
  }
  assert.equal(run({ dnt: "0" }).loaded.length, 1);
});

test("configures analytics without cookies, storage, or ad signals", () => {
  const { calls } = run();
  const byCommand = (name) => calls.filter(([command]) => command === name);

  const [[, consentMode, consentState]] = byCommand("consent");
  assert.equal(consentMode, "default");
  for (const key of ["ad_storage", "ad_user_data", "ad_personalization"]) {
    assert.equal(consentState[key], "denied", `${key} must default to denied`);
  }
  // Granting this writes _ga cookies on the live site — GA4 does not honor
  // client_storage "none". The privacy policy promises no cookies, so this
  // must stay denied unless the policy changes first.
  assert.equal(consentState.analytics_storage, "denied");

  const config = byCommand("config").find(([, id]) => id === "G-TEST12345");
  assert.ok(config, "expected a config call for the Measurement ID");
  assert.equal(config[2].client_storage, "none", "gtag must not write cookies");
  assert.equal(config[2].allow_google_signals, false);
  assert.equal(config[2].allow_ad_personalization_signals, false);

  const settings = Object.fromEntries(
    byCommand("set").map(([, key, value]) => [key, value]),
  );
  assert.equal(settings.ads_data_redaction, true);
  assert.equal(settings.url_passthrough, false);
});

test("tags every public page and no internal page", async () => {
  for (const [page, src] of taggedPages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    const tag = new RegExp(
      `<script defer src="${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=[\\w-]+"></script>`,
    );
    assert.match(html, tag, `${page} loads analytics from ${src}`);
    assert.ok(
      html.indexOf("analytics.js") < html.indexOf("</head>"),
      `${page} loads analytics in the head`,
    );
  }

  for (const page of untaggedPages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.doesNotMatch(html, /analytics\.js/, `${page} stays untagged`);
  }
});

test("keeps the privacy policy honest about website analytics", async () => {
  const html = await readFile(
    new URL("../privacy/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    html,
    /No analytics, ads, or activity tracking/,
    "the highlight may no longer claim the site has no analytics",
  );
  assert.match(html, /<section id="website-analytics">/);
  assert.match(html, /<a href="#website-analytics">Website analytics<\/a>/);
  assert.match(html, /Google Analytics/);
  assert.match(html, /sets no cookies/);
  assert.match(html, /Do Not Track/);
  assert.match(html, /Effective August 17, 2026/);
});
