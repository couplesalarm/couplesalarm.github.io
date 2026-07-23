const projectUrl = "https://xqdqgsbkapvlskcldmpe.supabase.co";
const publishableKey = "sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH";
const adminEmail = "couplesalarm.support@gmail.com";
const pageSize = 500;

export function summarizeResponses(responses) {
  const confidenceScores = responses
    .map((response) => Number.parseInt(response.confidence, 10))
    .filter((score) => score >= 1 && score <= 5);
  const rolesReached = responses.filter(
    (response) => response.roles !== "I did not reach this step",
  );
  const completelyClear = rolesReached.filter(
    (response) => response.roles === "Yes, completely",
  ).length;

  return {
    total: responses.length,
    alarmProblems: responses.filter(
      (response) => response.alarm === "I had a problem",
    ).length,
    averageConfidence: confidenceScores.length
      ? confidenceScores.reduce((sum, score) => sum + score, 0) /
        confidenceScores.length
      : null,
    rolesClearPercent: rolesReached.length
      ? (completelyClear / rolesReached.length) * 100
      : null,
  };
}

export function filterResponses(responses, query, build) {
  const needle = query.trim().toLocaleLowerCase();
  return responses.filter((response) => {
    if (build && response.build !== build) return false;
    if (!needle) return true;
    return [
      response.build,
      response.app_version,
      response.ios_version,
      response.tested?.join(" "),
      response.roles,
      response.waking_role,
      response.result_clarity,
      response.alarm,
      response.confidence,
      response.unclear,
      response.improvement,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(needle));
  });
}

export async function fetchAllFeedback(accessToken, fetchImpl = fetch) {
  const responses = [];
  for (let offset = 0; ; offset += pageSize) {
    const endpoint = new URL(
      `${projectUrl}/rest/v1/couples_alarm_beta_feedback`,
    );
    endpoint.searchParams.set(
      "select",
      "id,created_at,build,app_version,ios_version,entry_point,tested,roles,waking_role,result_clarity,alarm,confidence,unclear,improvement,source",
    );
    endpoint.searchParams.set("order", "created_at.desc");

    const result = await fetchImpl(endpoint, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        Range: `${offset}-${offset + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!result.ok) throw new Error("Responses could not be loaded");
    const page = await result.json();
    responses.push(...page);
    if (page.length < pageSize) return responses;
  }
}

if (typeof document !== "undefined") {
  const loginPanel = document.querySelector("#login-panel");
  const dashboard = document.querySelector("#dashboard");
  const sendLinkButton = document.querySelector("#send-link");
  const signOutButton = document.querySelector("#sign-out");
  const refreshButton = document.querySelector("#refresh");
  const searchInput = document.querySelector("#search");
  const buildFilter = document.querySelector("#build-filter");
  const loginStatus = document.querySelector("#login-status");
  const dashboardStatus = document.querySelector("#dashboard-status");
  const responseList = document.querySelector("#responses");
  const responseTemplate = document.querySelector("#response-template");
  let responses = [];

  function storeTokenFromFragment() {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("access_token");
    if (!token) return;
    sessionStorage.setItem("feedback-admin-token", token);
    history.replaceState(null, "", window.location.pathname);
  }

  async function authorizedEmail(token) {
    const response = await fetch(`${projectUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return false;
    const user = await response.json();
    return user.email?.toLocaleLowerCase() === adminEmail;
  }

  function renderMetrics() {
    const summary = summarizeResponses(responses);
    document.querySelector("#metric-total").textContent = String(summary.total);
    document.querySelector("#metric-alarm-problems").textContent = String(
      summary.alarmProblems,
    );
    document.querySelector("#metric-confidence").textContent =
      summary.averageConfidence === null
        ? "—"
        : summary.averageConfidence.toFixed(1);
    document.querySelector("#metric-roles").textContent =
      summary.rolesClearPercent === null
        ? "—"
        : `${Math.round(summary.rolesClearPercent)}%`;
  }

  function renderBuildOptions() {
    const selected = buildFilter.value;
    const builds = [...new Set(responses.map((response) => response.build))]
      .filter(Boolean)
      .sort((left, right) =>
        String(right).localeCompare(String(left), undefined, { numeric: true }),
      );
    buildFilter.replaceChildren(new Option("All builds", ""));
    for (const build of builds) {
      buildFilter.add(new Option(`Build ${build}`, build));
    }
    buildFilter.value = builds.includes(selected) ? selected : "";
  }

  function text(value, fallback = "Not answered") {
    return value || fallback;
  }

  function renderResponses() {
    const filtered = filterResponses(
      responses,
      searchInput.value,
      buildFilter.value,
    );
    responseList.replaceChildren();
    document.querySelector("#response-count").textContent =
      `${filtered.length} of ${responses.length}`;

    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = responses.length
        ? "No responses match these filters."
        : "No feedback has been submitted yet.";
      responseList.append(empty);
      return;
    }

    for (const response of filtered) {
      const card = responseTemplate.content.cloneNode(true);
      card.querySelector(".response-date").textContent =
        new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(response.created_at));
      card.querySelector(".response-context").textContent = [
        response.build ? `Build ${response.build}` : "Build unknown",
        response.app_version ? `App ${response.app_version}` : null,
        response.ios_version ? `iOS ${response.ios_version}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      card.querySelector(".confidence-badge").textContent =
        response.confidence?.match(/^[1-5]/)?.[0] || "—";
      card.querySelector('[data-field="tested"]').textContent = text(
        response.tested?.join(", "),
        "No parts selected",
      );
      for (const field of [
        "roles",
        "waking_role",
        "result_clarity",
        "alarm",
        "unclear",
        "improvement",
      ]) {
        card.querySelector(`[data-field="${field}"]`).textContent = text(
          response[field],
          field === "unclear" || field === "improvement"
            ? "No comment"
            : "Not answered",
        );
      }
      card.querySelector(".response-reference").textContent =
        `Reference ${response.id}`;
      responseList.append(card);
    }
  }

  async function loadDashboard() {
    const token = sessionStorage.getItem("feedback-admin-token");
    if (!token || !(await authorizedEmail(token))) {
      sessionStorage.removeItem("feedback-admin-token");
      loginPanel.hidden = false;
      dashboard.hidden = true;
      signOutButton.hidden = true;
      return;
    }

    loginPanel.hidden = true;
    dashboard.hidden = false;
    signOutButton.hidden = false;
    dashboardStatus.textContent = "Loading responses…";
    try {
      responses = await fetchAllFeedback(token);
      renderMetrics();
      renderBuildOptions();
      renderResponses();
      document.querySelector("#updated-at").textContent =
        `Updated ${new Intl.DateTimeFormat(undefined, {
          timeStyle: "short",
        }).format(new Date())}`;
      dashboardStatus.textContent = "";
    } catch {
      dashboardStatus.textContent =
        "Responses could not be loaded. Sign in again and retry.";
    }
  }

  sendLinkButton.addEventListener("click", async () => {
    sendLinkButton.disabled = true;
    loginStatus.textContent = "Sending a one-time link…";
    try {
      const redirectTo = new URL("./", window.location.href);
      redirectTo.hash = "";
      const endpoint = new URL(`${projectUrl}/auth/v1/otp`);
      endpoint.searchParams.set("redirect_to", redirectTo.href);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: adminEmail, create_user: true }),
      });
      if (!response.ok) throw new Error("Sign-in link could not be sent");
      loginStatus.textContent =
        "Check the Couples Alarm support inbox for your sign-in link.";
    } catch {
      loginStatus.textContent =
        "The sign-in link could not be sent. Please try again.";
    } finally {
      sendLinkButton.disabled = false;
    }
  });

  signOutButton.addEventListener("click", () => {
    sessionStorage.removeItem("feedback-admin-token");
    location.reload();
  });
  refreshButton.addEventListener("click", loadDashboard);
  searchInput.addEventListener("input", renderResponses);
  buildFilter.addEventListener("change", renderResponses);

  storeTokenFromFragment();
  loadDashboard();
}
