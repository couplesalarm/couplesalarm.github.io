import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const analytics = await readFile(
  new URL("../assets/analytics.js", import.meta.url),
  "utf8",
);
const recorder = await readFile(
  new URL("../supabase/functions/record-page-view/index.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260817120000_create_couples_alarm_page_views.sql",
    import.meta.url,
  ),
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

// Runs assets/analytics.js against a stub browser and reports what it sent.
const run = ({
  hostname = "couplesalarm.com",
  pathname = "/compatibility/",
  search = "?utm=x",
  referrer = "https://news.ycombinator.com/item?id=1",
  dnt = null,
  prerendering = false,
} = {}) => {
  const sent = [];
  const listeners = {};
  const sandbox = {
    navigator: { doNotTrack: dnt },
    document: {
      referrer,
      prerendering,
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    },
    fetch: (url, options) => {
      sent.push({ url, options, body: JSON.parse(options.body) });
      return { catch: () => {} };
    },
  };
  sandbox.window = sandbox;
  sandbox.window.location = { hostname, pathname, search };
  vm.createContext(sandbox);
  vm.runInContext(analytics, sandbox);
  return {
    sent,
    firePrerenderingChange: () => listeners.prerenderingchange?.(),
  };
};

test("no longer ships Google Analytics", () => {
  for (const trace of [
    "gtag",
    "googletagmanager",
    "G-3DZB7Q51CM",
    "dataLayer",
  ]) {
    assert.doesNotMatch(analytics, new RegExp(trace), `${trace} must be gone`);
  }
});

test("posts the page view to our own function", () => {
  const { sent } = run();
  assert.equal(sent.length, 1);
  assert.equal(
    sent[0].url,
    "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/record-page-view",
  );
  assert.equal(sent[0].options.method, "POST");
  assert.equal(sent[0].options.credentials, "omit");
  assert.equal(sent[0].options.keepalive, true);
});

test("never sends the query string, which can carry personal data", () => {
  const { sent } = run({ pathname: "/download/", search: "?email=a@b.com" });
  assert.equal(sent[0].body.path, "/download/");
  assert.doesNotMatch(JSON.stringify(sent[0].body), /a@b\.com/);
});

test("sends the referrer, and null when there is none", () => {
  assert.equal(
    run().sent[0].body.referrer,
    "https://news.ycombinator.com/item?id=1",
  );
  assert.equal(run({ referrer: "" }).sent[0].body.referrer, null);
});

test("counts only the production hostnames", () => {
  for (const hostname of ["couplesalarm.com", "www.couplesalarm.com"]) {
    assert.equal(run({ hostname }).sent.length, 1, `${hostname} should count`);
  }
  for (const hostname of ["localhost", "127.0.0.1", "couplesalarm.github.io"]) {
    assert.deepEqual(run({ hostname }).sent, [], `${hostname} must not count`);
  }
});

test("honors Do Not Track by sending nothing", () => {
  for (const dnt of ["1", "yes"]) {
    assert.deepEqual(
      run({ dnt }).sent,
      [],
      `doNotTrack=${dnt} must send nothing`,
    );
  }
  assert.equal(run({ dnt: "0" }).sent.length, 1);
});

test("waits for a prerendered page to actually be viewed", () => {
  const { sent, firePrerenderingChange } = run({ prerendering: true });
  assert.deepEqual(sent, [], "a prerender must not count as a visit");
  firePrerenderingChange();
  assert.equal(sent.length, 1);
});

test("tags every public page and no internal page", async () => {
  for (const [page, src] of taggedPages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    const tag = new RegExp(
      `<script defer src="${src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=[\\w-]+"></script>`,
    );
    assert.match(html, tag, `${page} loads the counter from ${src}`);
  }
  for (const page of untaggedPages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.doesNotMatch(html, /analytics\.js/, `${page} stays untagged`);
  }
});

test("bumps the cache key whenever the counter changes", async () => {
  // A stale key silently keeps the old build alive in every returning browser.
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const version = /analytics\.js\?v=([\w-]+)/.exec(html)[1];
  for (const retired of ["20260817-analytics", "20260817-cookieless-2"]) {
    assert.notEqual(version, retired, `${retired} shipped Google Analytics`);
  }
});

test("the recorder stores no IP and no cross-day identifier", () => {
  // The salt is mixed with the UTC date, so yesterday's hash is unrecoverable.
  assert.match(recorder, /now\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(recorder, /PAGE_VIEW_SALT/);
  assert.doesNotMatch(migration, /ip_address|user_agent/i);
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all privileges on table public\.couples_alarm_page_views from anon, authenticated/,
  );
});

test("the recorder drops query strings and self-referrals", () => {
  assert.match(recorder, /value\.split\(\/\[\?#\]\/\)\[0\]/);
  assert.match(recorder, /host === "couplesalarm\.com"/);
});

test("the privacy policy describes first-party counting, not Google", async () => {
  const html = await readFile(
    new URL("../privacy/index.html", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(html, /Google Analytics to count/);
  assert.match(
    html,
    /without Google Analytics or any other advertising or analytics company/,
  );
  assert.match(html, /no cookies and no browser storage/);
  assert.match(html, /IP address is never stored/);
  assert.match(html, /Do Not Track/);
});
