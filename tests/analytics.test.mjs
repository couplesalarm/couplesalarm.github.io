import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
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
  windowDnt = null,
  msDnt = null,
  prerendering = false,
} = {}) => {
  const sent = [];
  const listeners = {};
  const sandbox = {
    URL,
    navigator: { doNotTrack: dnt, msDoNotTrack: msDnt },
    document: {
      referrer,
      prerendering,
      addEventListener: (name, fn, options) => {
        listeners[name] = { fn, once: options?.once };
      },
    },
    fetch: (url, options) => {
      sent.push({ url, options, body: JSON.parse(options.body) });
      return { catch: () => {} };
    },
  };
  sandbox.window = sandbox;
  sandbox.window.doNotTrack = windowDnt;
  sandbox.window.location = { hostname, pathname, search };
  vm.createContext(sandbox);
  vm.runInContext(analytics, sandbox);
  return {
    sent,
    firePrerenderingChange: () => {
      const listener = listeners.prerenderingchange;
      if (listener?.once) delete listeners.prerenderingchange;
      listener?.fn();
    },
  };
};

// Execute the actual recorder with a local database stub; never call Supabase.
const runRecorder = () => {
  const stored = [];
  const environment = {
    SUPABASE_URL: "https://database.example.test",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    PAGE_VIEW_SALT: "synthetic-daily-salt",
  };
  const sandbox = {
    URL,
    Request,
    Response,
    TextEncoder,
    crypto: webcrypto,
    Deno: {
      env: { get: (name) => environment[name] },
      serve: () => {},
    },
    fetch: async (url, options) => {
      assert.equal(
        url,
        "https://database.example.test/rest/v1/couples_alarm_page_views",
      );
      stored.push(JSON.parse(options.body));
      return { ok: true };
    },
  };
  const source = recorder
    .replace(/^import "jsr:[^\n]+\n/m, "")
    .replace(/^export /gm, "");
  vm.createContext(sandbox);
  vm.runInContext(stripTypeScriptTypes(source), sandbox);
  return {
    stored,
    referrerHost: sandbox.referrerHost,
    handleRequest: sandbox.handleRequest,
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
  assert.equal(sent[0].options.referrerPolicy, "no-referrer");
  assert.equal(sent[0].options.keepalive, true);
});

test("never sends the query string, which can carry personal data", () => {
  const { sent } = run({ pathname: "/download/", search: "?email=a@b.com" });
  assert.equal(sent[0].body.path, "/download/");
  assert.doesNotMatch(JSON.stringify(sent[0].body), /a@b\.com/);
});

test("sends only the referrer scheme and hostname", () => {
  assert.equal(
    run().sent[0].body.referrer,
    "https://news.ycombinator.com",
  );
  const { sent } = run({
    referrer:
      "https://private-user:secret-password@News.Example.test:8443/private/person?email=person@example.test&token=private-token#secret-fragment",
  });
  assert.equal(sent[0].body.referrer, "https://news.example.test");
  assert.deepEqual(Object.keys(sent[0].body), ["path", "referrer"]);
  assert.doesNotMatch(
    sent[0].options.body,
    /private-user|secret-password|8443|private\/person|email|token|secret-fragment/,
  );
  assert.equal(
    run({ referrer: "http://news.example.test:8080/page?secret=value" }).sent[0]
      .body.referrer,
    "http://news.example.test",
  );
});

test("omits empty, malformed, and non-web referrers", () => {
  for (const referrer of [
    "",
    null,
    "not a URL?email=person@example.test",
    "/relative/path?token=private-token",
    "https://",
    "mailto:person@example.test",
    "data:text/plain,private-token",
    "javascript:alert('private-token')",
    "file:///private/person",
    "ftp://private-user:secret-password@news.example.test/private/person",
  ]) {
    assert.equal(run({ referrer }).sent[0].body.referrer, null, String(referrer));
  }
});

test("minimized client referrers preserve server host attribution", async () => {
  const { stored, handleRequest } = runRecorder();
  for (const [referrer, expectedHost] of [
    [
      "https://private-user:secret-password@News.Example.test:8443/private/person?email=person@example.test#secret-fragment",
      "news.example.test",
    ],
    [
      "http://news.example.test:8080/private/person?token=private-token",
      "news.example.test",
    ],
    ["https://couplesalarm.com/download/?token=private-token", null],
    ["https://www.couplesalarm.com/compatibility/#secret-fragment", null],
    ["", null],
    ["not a URL?email=person@example.test", null],
    ["mailto:person@example.test", null],
  ]) {
    const { sent } = run({ referrer });
    const response = await handleRequest(
      new Request("https://recorder.example.test", {
        method: "POST",
        headers: {
          Origin: "https://couplesalarm.com",
          "Content-Type": "application/json",
        },
        body: sent[0].options.body,
      }),
    );
    assert.equal(response.status, 204);
    const row = stored.at(-1);
    assert.equal(row.referrer_host, expectedHost, referrer);
    assert.equal(row.path, "/compatibility/");
    assert.deepEqual(Object.keys(row), ["path", "referrer_host", "visitor_hash"]);
    assert.doesNotMatch(
      JSON.stringify(row),
      /private-user|secret-password|8443|8080|private\/person|email|token|secret-fragment/,
    );
  }
  assert.equal(stored.length, 7);
});

test("the actual server normalizer strips sensitive referrer details", () => {
  const { referrerHost } = runRecorder();
  assert.equal(
    referrerHost(
      "https://private-user:secret-password@News.Example.test:8443/private/person?email=person@example.test#secret-fragment",
    ),
    "news.example.test",
  );
  for (const referrer of [
    null,
    "",
    "not a URL",
    "/relative/path",
    "https://couplesalarm.com/private?token=x",
    "https://www.couplesalarm.com/private?token=x",
  ]) {
    assert.equal(referrerHost(referrer), null, String(referrer));
  }
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
  assert.deepEqual(run({ windowDnt: "1" }).sent, []);
  assert.deepEqual(run({ msDnt: "1" }).sent, []);
  assert.equal(run({ dnt: "0" }).sent.length, 1);
});

test("waits for a prerendered page to actually be viewed", () => {
  const { sent, firePrerenderingChange } = run({ prerendering: true });
  assert.deepEqual(sent, [], "a prerender must not count as a visit");
  firePrerenderingChange();
  assert.equal(sent.length, 1);
  firePrerenderingChange();
  assert.equal(sent.length, 1, "the prerendering listener runs only once");
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
