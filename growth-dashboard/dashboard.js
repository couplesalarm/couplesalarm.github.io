const numberFormat = new Intl.NumberFormat("en-US");
const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function snapshotFreshness(throughDate, now = Date.now()) {
  const sourceDay = Date.parse(`${throughDate}T00:00:00Z`);
  const current = new Date(now);
  const today = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  if (!Number.isFinite(sourceDay) || !Number.isFinite(today)) {
    return { state: "stale", label: "Apple report date unavailable" };
  }
  const daysBehind = Math.max(0, Math.floor((today - sourceDay) / 86_400_000));
  if (daysBehind <= 1) return { state: "fresh", label: "Apple report current" };
  return { state: "stale", label: `Apple data ${daysBehind} days behind` };
}

function setMode(element, mode) {
  const automatic = mode === "automatic";
  element.textContent = automatic ? "Automatic daily" : "Manual snapshot";
  element.classList.toggle("auto", automatic);
  element.classList.toggle("manual", !automatic);
}

export function renderDashboard(snapshot, doc = globalThis.document, now = Date.now()) {
  const freshness = snapshotFreshness(snapshot.apple.throughDate, now);
  const status = doc.querySelector("#snapshot-status");
  status.textContent = `${freshness.label} · checked ${dateFormat.format(new Date(snapshot.generatedAt))}`;
  status.dataset.state = freshness.state;

  doc.querySelector("#first-time-downloads").textContent = numberFormat.format(snapshot.apple.firstTimeDownloads);
  doc.querySelector("#paid-unlocks").textContent = numberFormat.format(snapshot.apple.netPaidUnlocks);
  doc.querySelector("#estimated-proceeds").textContent = currencyFormat.format(snapshot.apple.estimatedProceedsUsd);
  doc.querySelector("#rating-count").textContent = numberFormat.format(snapshot.apple.usRatingCount);

  const appleThrough = doc.querySelector("#apple-through");
  appleThrough.dateTime = snapshot.apple.throughDate;
  appleThrough.textContent = dateFormat.format(new Date(`${snapshot.apple.throughDate}T00:00:00Z`));
  setMode(doc.querySelector("#apple-mode"), snapshot.apple.mode);
  setMode(doc.querySelector("#social-mode"), snapshot.social.mode);

  const socialUpdated = doc.querySelector("#social-updated");
  socialUpdated.dateTime = snapshot.social.updatedAt;
  socialUpdated.textContent = dateFormat.format(new Date(snapshot.social.updatedAt));

  const maxViews = Math.max(1, ...snapshot.social.platforms.map(({ views }) => views));
  const bars = snapshot.social.platforms.map(({ name, views }) => {
    const row = doc.createElement("li");
    row.className = "bar-row";
    const platform = doc.createElement("span");
    platform.className = "platform";
    platform.textContent = name;
    const track = doc.createElement("span");
    track.className = "bar-track";
    const bar = doc.createElement("span");
    bar.className = "bar";
    bar.style.setProperty("--bar-width", `${Math.max(1, (views / maxViews) * 100)}%`);
    track.append(bar);
    const value = doc.createElement("span");
    value.className = "bar-value";
    value.textContent = numberFormat.format(views);
    row.append(platform, track, value);
    return row;
  });
  doc.querySelector("#social-bars").replaceChildren(...bars);
}

export async function loadDashboard(fetchImpl = globalThis.fetch, doc = globalThis.document, now = Date.now()) {
  const response = await fetchImpl(`data.json?ts=${now}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Dashboard snapshot request failed (${response.status})`);
  const snapshot = await response.json();
  renderDashboard(snapshot, doc, now);
  return snapshot;
}

if (typeof document !== "undefined") {
  const refresh = document.querySelector("#refresh-dashboard");
  const error = document.querySelector("#refresh-error");
  const run = async () => {
    refresh.disabled = true;
    refresh.textContent = "Checking…";
    error.textContent = "";
    try {
      await loadDashboard();
      refresh.textContent = "Check for updates";
    } catch {
      error.textContent = "Couldn’t reach the published snapshot. Showing the last loaded values.";
      refresh.textContent = "Try again";
    } finally {
      refresh.disabled = false;
    }
  };
  refresh.addEventListener("click", run);
  run();
}
