const feedbackEndpoint =
  "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/list-couples-alarm-feedback";

export function summarizeResponses(responses) {
  const ratings = responses
    .map((response) => Number(response.rating))
    .filter(
      (rating) => Number.isInteger(rating) && rating >= 1 && rating <= 10,
    );

  return {
    total: responses.length,
    alarmProblems: responses.filter(
      (response) =>
        response.alarm === "I had a problem" ||
        response.alarm === "No, it was early, late, or did not go off",
    ).length,
    averageRating: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
    soundDealbreakers: responses.filter(
      (response) => response.sound_dealbreaker === "Yes",
    ).length,
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
      response.experience_clarity,
      response.alarm,
      response.alarm_loud_enough,
      response.sound_annoyance,
      response.sound_dealbreaker,
      response.confidence,
      response.rating,
      response.unclear,
      response.improvement,
      response.expected_missing,
      response.additional_comments,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(needle));
  });
}

export async function fetchAllFeedback(passcode, fetchImpl = fetch) {
  const result = await fetchImpl(feedbackEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode }),
  });
  if (!result.ok) {
    const error = new Error("Responses could not be loaded");
    error.status = result.status;
    throw error;
  }
  const body = await result.json();
  if (!Array.isArray(body.responses)) {
    throw new Error("Responses could not be loaded");
  }
  return body.responses;
}

if (typeof document !== "undefined") {
  const loginPanel = document.querySelector("#login-panel");
  const loginForm = document.querySelector("#login-form");
  const passcodeInput = document.querySelector("#passcode");
  const dashboard = document.querySelector("#dashboard");
  const signOutButton = document.querySelector("#sign-out");
  const refreshButton = document.querySelector("#refresh");
  const searchInput = document.querySelector("#search");
  const buildFilter = document.querySelector("#build-filter");
  const loginStatus = document.querySelector("#login-status");
  const dashboardStatus = document.querySelector("#dashboard-status");
  const responseList = document.querySelector("#responses");
  const responseTemplate = document.querySelector("#response-template");
  let responses = [];
  let adminPasscode = "";

  function renderMetrics() {
    const summary = summarizeResponses(responses);
    document.querySelector("#metric-total").textContent = String(summary.total);
    document.querySelector("#metric-alarm-problems").textContent = String(
      summary.alarmProblems,
    );
    document.querySelector("#metric-rating").textContent =
      summary.averageRating === null ? "—" : summary.averageRating.toFixed(1);
    document.querySelector("#metric-dealbreakers").textContent = String(
      summary.soundDealbreakers,
    );
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
        response.rating || response.confidence?.match(/^[1-5]/)?.[0] || "—";
      card.querySelector('[data-field="tested"]').textContent = text(
        response.tested?.join(", "),
        "No parts selected",
      );
      for (const field of [
        "roles",
        "waking_role",
        "result_clarity",
        "experience_clarity",
        "alarm",
        "alarm_loud_enough",
        "sound_annoyance",
        "sound_dealbreaker",
        "rating",
        "confidence",
      ]) {
        const answer = card.querySelector(`[data-field="${field}"]`);
        if (response[field] === null || response[field] === undefined) {
          answer.closest("div").hidden = true;
        } else {
          answer.textContent = text(response[field]);
        }
      }
      for (const field of [
        "unclear",
        "improvement",
        "expected_missing",
        "additional_comments",
      ]) {
        const answer = card.querySelector(`[data-field="${field}"]`);
        if (!response[field]) {
          answer.closest("div").hidden = true;
        } else {
          answer.textContent = response[field];
        }
      }
      card.querySelector(".response-reference").textContent =
        `Reference ${response.id}`;
      responseList.append(card);
    }
  }

  async function loadDashboard() {
    dashboardStatus.textContent = "Loading responses…";
    try {
      responses = await fetchAllFeedback(adminPasscode);
      loginPanel.hidden = true;
      dashboard.hidden = false;
      signOutButton.hidden = false;
      renderMetrics();
      renderBuildOptions();
      renderResponses();
      document.querySelector("#updated-at").textContent =
        `Updated ${new Intl.DateTimeFormat(undefined, {
          timeStyle: "short",
        }).format(new Date())}`;
      dashboardStatus.textContent = "";
      loginStatus.textContent = "";
      passcodeInput.value = "";
    } catch (error) {
      if (error.status === 401) {
        adminPasscode = "";
        loginPanel.hidden = false;
        dashboard.hidden = true;
        signOutButton.hidden = true;
        loginStatus.textContent = "That passcode was not accepted.";
        passcodeInput.select();
        return;
      }
      dashboardStatus.textContent =
        "Responses could not be loaded. Please try again.";
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    adminPasscode = passcodeInput.value;
    loginStatus.textContent = "Opening dashboard…";
    await loadDashboard();
  });

  signOutButton.addEventListener("click", () => {
    adminPasscode = "";
    responses = [];
    loginPanel.hidden = false;
    dashboard.hidden = true;
    signOutButton.hidden = true;
    passcodeInput.focus();
  });
  refreshButton.addEventListener("click", loadDashboard);
  searchInput.addEventListener("input", renderResponses);
  buildFilter.addEventListener("change", renderResponses);

  passcodeInput.focus();
}
