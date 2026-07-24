const emailEndpoint = "https://api.resend.com/emails";

export async function sendFeedbackNotification(
  reference: string,
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
      subject: "New Couples Alarm beta feedback",
      text:
        `New beta feedback was submitted.\n\nReference: ${reference}\n\n` +
        "Review it: https://couplesalarm.github.io/admin/",
    }),
  });
  if (!response.ok) throw new Error("Feedback email failed");
}
