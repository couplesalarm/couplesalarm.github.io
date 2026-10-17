import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const analytics = await readFile(
  new URL("../assets/analytics.js", import.meta.url),
  "utf8",
);
const campaignLinks = await readFile(new URL("../assets/campaign-links.js", import.meta.url), "utf8");
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
  ["../beta/android/index.html", "../../assets/analytics.js"],
  ["../wake-up-without-waking-partner/index.html", "../assets/analytics.js"],
  ["../opposite-shifts-couples-alarm/index.html", "../assets/analytics.js"],
  ["../iphone-vibrate-only-alarm/index.html", "../assets/analytics.js"],
  ["../alarm-without-smartwatch/index.html", "../assets/analytics.js"],
  ["../vibration-alarm-app-alternative/index.html", "../assets/analytics.js"],
  ["../early-riser-alarm/index.html", "../assets/analytics.js"],
  ["../best-alarm-apps-for-couples/index.html", "../assets/analytics.js"],
  ["../alarm-tone-only-one-person-hears/index.html", "../assets/analytics.js"],
];

const untaggedPages = [
  "../admin/index.html",
  "../growth-dashboard/index.html",
  "../beta/index.html",
  "../feedback/index.html",
];

// Runs assets/analytics.js against a stub browser and reports what it sent.
const run = ({
  record = true,
  hostname = "couplesalarm.com",
  pathname = "/compatibility/",
  search = "?utm=x",
  referrer = "https://news.ycombinator.com/item?id=1",
  dnt = null,
  prerendering = false,
  hrefs = ["https://apps.apple.com/us/app/couples-alarm/id6792771975"],
} = {}) => {
  const sent = [];
  const listeners = {};
  const links = hrefs.map(href => ({ href, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } }));
  const sandbox = {
    URL,
    URLSearchParams,
    navigator: { doNotTrack: dnt },
    document: {
      referrer,
      prerendering,
      querySelectorAll: () => links,
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
  vm.runInContext(campaignLinks, sandbox);
  if (record) vm.runInContext(analytics, sandbox);
  return {
    sent,
    links,
    clickStore: () => listeners.click?.({ type: "click", target: { closest: () => links[0] } }),
    clickInternal: (href) => {
      const link = { href };
      listeners.click?.({ target: { closest: () => link } });
      return link.href;
    },
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

test("sends only the referrer host, and null when there is none", () => {
  assert.equal(
    run().sent[0].body.referrer,
    "news.ycombinator.com",
  );
  assert.equal(run({ referrer: "" }).sent[0].body.referrer, null);
});

test("counts store clicks separately and keeps the direct attributed store URL", () => {
  const runResult = run({ search: "?ct=paid_facebook_iphone&email=private@example.com" });
  const url = new URL(runResult.links[0].href);
  assert.equal(url.hostname, "apps.apple.com");
  assert.equal(url.searchParams.get("pt"), "129195755");
  assert.equal(url.searchParams.get("ct"), "paid_facebook_iphone");
  runResult.clickStore();
  assert.deepEqual(runResult.sent.map(row => row.body.event_type), ["page_view", "app_store_click"]);
  assert.equal(runResult.sent[1].body.campaign, "paid_facebook_iphone");
  assert.doesNotMatch(JSON.stringify(runResult.sent), /private@example/);
});

test("does not collect arbitrary campaign values or alter other apps", () => {
  const result = run({ search: "?ct=private@example.com", hrefs: ["https://apps.apple.com/app/id123"] });
  assert.equal(result.sent[0].body.campaign, null);
  assert.equal(result.links[0].href, "https://apps.apple.com/app/id123");
  result.clickStore();
  assert.equal(result.sent.length, 1);
});

const tiktokUtm = "utm_source=tiktok&utm_medium=paid_social&utm_campaign=website_link_test_20261011";

test("the approved TikTok UTM route attributes views, internal handoffs and store clicks", () => {
  const result = run({ pathname: "/", search: "?" + tiktokUtm + "&email=private@example.com" });
  assert.equal(result.sent[0].body.campaign, "paid_tiktok_iphone");
  assert.equal(new URL(result.links[0].href).searchParams.get("ct"), "paid_tiktok_iphone");
  assert.equal(new URL(result.clickInternal("/download/")).search, "?ct=paid_tiktok_iphone");
  result.clickStore();
  assert.equal(result.sent[1].body.campaign, "paid_tiktok_iphone");
  assert.doesNotMatch(JSON.stringify(result.sent), /utm_|website_link_test|private@example/);
});

test("the dedicated TikTok ct token works without UTM parameters", () => {
  const result = run({ search: "?ct=paid_tiktok_iphone" });
  result.clickStore();
  assert.deepEqual(result.sent.map(row => row.body.campaign), ["paid_tiktok_iphone", "paid_tiktok_iphone"]);
});

test("unapproved or incomplete TikTok UTM tuples stay unlabelled", () => {
  for (const search of [
    "?utm_source=tiktok",
    "?" + tiktokUtm.replace("tiktok", "other"),
    "?" + tiktokUtm.replace("paid_social", "organic"),
    "?" + tiktokUtm.replace("website_link_test_20261011", "private@example.com"),
  ]) {
    const result = run({ search });
    assert.equal(result.sent[0].body.campaign, null);
    result.clickStore();
    assert.equal(result.sent[1].body.campaign, "owned_website");
    assert.doesNotMatch(JSON.stringify(result.sent), /utm_|private@example/);
  }
});

test("explicit campaign labels and QA override the TikTok alias", () => {
  for (const campaign of ["tracking_qa", "paid_facebook_iphone"]) {
    const result = run({ search: "?" + tiktokUtm + "&ct=" + campaign });
    result.clickStore();
    assert.deepEqual(result.sent.map(row => row.body.campaign), [campaign, campaign]);
    assert.equal(new URL(result.clickInternal("/download/")).searchParams.get("ct"), campaign);
  }
});

test("Do Not Track suppresses the approved TikTok alias and all events", () => {
  const result = run({ dnt: "1", search: "?" + tiktokUtm });
  result.clickStore();
  assert.deepEqual(result.sent, []);
  assert.equal(new URL(result.links[0].href).search, "");
  assert.equal(result.clickInternal("/download/"), "/download/");
});

test("preserves approved campaign attribution through static and dynamic internal steps", () => {
  const result = run({ search: "?ct=paid_facebook_iphone&email=private@example.com", hrefs: ["https://couplesalarm.com/compatibility/"] });
  assert.equal(new URL(result.links[0].href).search, "?ct=paid_facebook_iphone");
  const next = new URL(result.clickInternal("../download/#app-store-install"));
  assert.equal(next.pathname, "/download/");
  assert.equal(next.search, "?ct=paid_facebook_iphone");
  assert.equal(next.hash, "#app-store-install");
  assert.doesNotMatch(next.href, /email|private/);
  assert.equal(result.sent.length, 1, "navigation decoration does not count a store click");
});

test("internal tagging respects explicit sources, privacy boundaries and Do Not Track", () => {
  const result = run({ search: "?ct=paid_facebook_iphone" });
  for (const href of ["https://example.com/download/", "https://couplesalarm.com/admin/", "mailto:someone@example.com", "http://couplesalarm.com/download/", "https://couplesalarm.com/download/?ct=tracking_qa"]) {
    assert.equal(result.clickInternal(href), href);
  }
  for (const options of [{ dnt: "1", search: "?ct=paid_facebook_iphone" }, { search: "?ct=private@example.com" }]) {
    assert.equal(run(options).clickInternal("../download/"), "../download/");
  }
});

test("new guides preserve attribution through entry, cross-links and App Store clicks", () => {
  for (const path of ["/wake-up-without-waking-partner/", "/best-alarm-apps-for-couples/", "/alarm-tone-only-one-person-hears/", "/opposite-shifts-couples-alarm/", "/iphone-vibrate-only-alarm/", "/alarm-without-smartwatch/", "/vibration-alarm-app-alternative/", "/early-riser-alarm/"]) {
    for (const campaign of ["paid_facebook_iphone", "tracking_qa"]) {
      const entry = run({ pathname: "/download/", search: "?ct=" + campaign });
      const next = new URL(entry.clickInternal(path));
      assert.equal(next.searchParams.get("ct"), campaign);
      const page = run({ pathname: path, search: next.search });
      page.clickStore();
      assert.deepEqual(page.sent.map(row => [row.body.path, row.body.event_type, row.body.campaign]), [
        [path, "page_view", campaign], [path, "app_store_click", campaign],
      ]);
      const recovery = run({ pathname: "/download/", search: "", referrer: "https://couplesalarm.com" + path + next.search });
      assert.equal(recovery.sent[0].body.campaign, campaign);
    }
  }
});

test("Do Not Track also suppresses click counting and campaign tagging", () => {
  const result = run({ dnt: "1" });
  result.clickStore();
  assert.deepEqual(result.sent, []);
  assert.equal(new URL(result.links[0].href).search, "");
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


for (const campaign of ["paid_instagram_snooze_v14", "paid_ig_snooze_asian_v15", "paid_ig_snooze_white_v15", "paid_ig_snooze_black_v15"]) test(`${campaign} keeps a dedicated label through website and App Store steps`, () => {
  const result = run({ pathname: "/", search: "?ct=" + campaign + "&utm_campaign=snooze_war_v14_20261011&email=private@example.com" });
  const next = new URL(result.clickInternal("/compatibility/"));
  assert.equal(next.search, "?ct=" + campaign);
  const handoff = run({ pathname: next.pathname, search: next.search });
  assert.equal(new URL(handoff.links[0].href).searchParams.get("ct"), campaign);
  assert.equal(new URL(handoff.links[0].href).searchParams.get("pt"), "129195755");
  handoff.clickStore();
  assert.deepEqual(handoff.sent.map(row => row.body.campaign), [campaign, campaign]);
  assert.doesNotMatch(JSON.stringify([...result.sent, ...handoff.sent]), /utm_|private@example/);
  assert.equal(run({ search: "?ct=paid_instagram_iphone" }).sent[0].body.campaign, "paid_instagram_iphone");
});

const appStore = 'https://apps.apple.com/us/app/couples-alarm/id6792771975';
test('known acquisition survives defaults, support/privacy hops and the store handoff', () => {
  for (const campaign of ['paid_facebook_iphone', 'paid_tiktok_iphone', 'paid_ig_snooze_white_v15', 'tracking_qa']) {
    let current = new URL('https://couplesalarm.com/?ct=' + campaign + '&email=private@example.com');
    for (const path of ['/support/', '/privacy/', '/compatibility/', '/download/']) {
      const page = run({ pathname: current.pathname, search: current.search });
      current = new URL(page.clickInternal(path + '?ct=owned_website'));
      assert.equal(current.search, '?ct=' + campaign);
    }
    const page = run({ pathname: current.pathname, search: current.search, hrefs: [appStore + '?ct=owned_website'] });
    page.clickStore();
    assert.equal(new URL(page.links[0].href).searchParams.get('ct'), campaign);
    assert.deepEqual(page.sent.map(row => row.body.campaign), [campaign, campaign]);
    assert.doesNotMatch(JSON.stringify(page.sent), /private@example/);
  }
});

test('same-site public referrer recovers tags without browser storage or external inference', () => {
  const referrer = 'https://couplesalarm.com/work-with-us/?ct=paid_facebook_iphone&email=private@example.com';
  const page = run({ search: '?ct=owned_website', referrer });
  page.clickStore();
  assert.deepEqual(page.sent.map(row => row.body.campaign), ['paid_facebook_iphone', 'paid_facebook_iphone']);
  assert.doesNotMatch(JSON.stringify(page.sent), /private@example/);
  assert.equal(run({ search: '?ct=paid_tiktok_iphone', referrer }).sent[0].body.campaign, 'paid_tiktok_iphone');
  for (const referrer of ['https://facebook.com/?ct=paid_facebook_iphone', 'https://couplesalarm.com/admin/?ct=paid_facebook_iphone', 'http://couplesalarm.com/?ct=paid_facebook_iphone']) {
    assert.equal(run({ search: '', referrer }).sent[0].body.campaign, null);
  }
  assert.doesNotMatch(analytics + campaignLinks, /sessionStorage|localStorage|document\.cookie/);
});

test('QA cannot be overridden by a pretagged destination or a subsequent paid tag', () => {
  const page = run({ search: '?ct=tracking_qa', hrefs: [appStore + '?ct=paid_youtube_iphone'] });
  page.clickStore();
  assert.equal(page.sent[1].body.campaign, 'tracking_qa');
  assert.equal(run({ search: '?ct=paid_tiktok_iphone', referrer: 'https://couplesalarm.com/support/?ct=tracking_qa' }).sent[0].body.campaign, 'tracking_qa');
});

test('store click reads the current URL, handles dynamic links and retains specific destination tags', () => {
  const page = run({ search: '?ct=paid_facebook_iphone' });
  page.links[0].href = appStore + '?ct=owned_website';
  page.clickStore();
  assert.equal(page.sent[1].body.campaign, 'paid_facebook_iphone');
  const dynamic = new URL(page.clickInternal(appStore + '?ct=paid_youtube_iphone'));
  assert.equal(dynamic.searchParams.get('ct'), 'paid_youtube_iphone');
  assert.equal(page.sent[2].body.campaign, 'paid_youtube_iphone');
  assert.equal(page.clickInternal('https://apps.apple.com/app/id67927719750'), 'https://apps.apple.com/app/id67927719750');
  assert.equal(page.sent.length, 3);
});


test('uninstrumented public pages carry links without requests or form access', async () => {
  assert.doesNotMatch(campaignLinks, /\bfetch\s*\(|sendBeacon|XMLHttpRequest|querySelectorAll\(["'](?:input|form|textarea)|FormData/);
  for (const page of ['../work-with-us/index.html']) {
    const html = await readFile(new URL(page, import.meta.url), 'utf8');
    assert.match(html, /campaign-links\.js\?v=/);
    assert.doesNotMatch(html, /analytics\.js/);
  }
  const form = run({ record: false, pathname: '/work-with-us/', search: '?ct=tracking_qa' });
  assert.equal(form.sent.length, 0);
  assert.equal(new URL(form.clickInternal('../compatibility/')).search, '?ct=tracking_qa');
  form.clickStore();
  assert.equal(form.sent.length, 0);
});

test("counts Android beta step button clicks by step, only on /beta/android/", () => {
  const steps = [
    ["https://groups.google.com/g/couples-alarm-android-beta/about", "beta_group_click"],
    ["https://play.google.com/apps/testing/com.couplesalarm.android", "beta_optin_click"],
    ["https://play.google.com/store/apps/details?id=com.couplesalarm.android", "beta_play_click"],
  ];
  for (const [href, type] of steps) {
    const result = run({ pathname: "/beta/android/", hrefs: [] });
    result.clickInternal(href);
    assert.equal(result.sent.at(-1).body.event_type, type);
    assert.equal(result.sent.at(-1).body.path, "/beta/android/");
    const elsewhere = run({ pathname: "/", hrefs: [] });
    elsewhere.clickInternal(href);
    assert.ok(elsewhere.sent.every(call => !call.body.event_type?.startsWith("beta_")));
  }
});
