const emailEndpoint = "https://api.resend.com/emails";

export type Summary = {
  views: number;
  visitors: number;
  top_pages: { path: string; views: number }[];
  top_referrers: { referrer_host: string; views: number }[];
};

// The full UTC calendar month before the one `now` falls in.
export function lastMonthRange(now = new Date()) {
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export function monthLabel(start: Date) {
  return start.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "no change" : "first month with data";
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return "flat vs. the month before";
  return `${percent > 0 ? "up" : "down"} ${Math.abs(percent)}% vs. the month before`;
}

export function buildReport(
  label: string,
  current: Summary,
  previous: Summary,
) {
  const lines = [
    `Couples Alarm website — ${label}`,
    "",
    `Visitors: ${current.visitors} (${change(current.visitors, previous.visitors)})`,
    `Page views: ${current.views} (${change(current.views, previous.views)})`,
  ];

  if (current.top_pages.length) {
    lines.push("", "Most visited pages:");
    for (const page of current.top_pages) {
      lines.push(`  ${page.views.toString().padStart(6)}  ${page.path}`);
    }
  }

  if (current.top_referrers.length) {
    lines.push("", "Where they came from:");
    for (const referrer of current.top_referrers) {
      lines.push(
        `  ${referrer.views.toString().padStart(6)}  ${referrer.referrer_host}`,
      );
    }
  } else {
    lines.push("", "No referrers recorded — visitors arrived directly.");
  }

  lines.push(
    "",
    "Visitor counts are approximate. The site sets no cookies, so someone",
    "visiting on two days counts twice.",
  );
  return lines.join("\n");
}

export async function sendMonthlyReport(
  label: string,
  body: string,
  apiKey: string,
  fetchImpl = fetch,
) {
  const response = await fetchImpl(emailEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Couples Alarm <onboarding@resend.dev>",
      to: ["bmarko@gmail.com"],
      subject: `Couples Alarm website — ${label}`,
      text: body,
    }),
  });
  if (!response.ok) throw new Error("Monthly report email failed");
}
