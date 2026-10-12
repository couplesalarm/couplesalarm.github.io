// Uses the existing feedback sender; inquiry recipient is configured separately. No inquiry
// values other than its random reference may enter the notification.
export async function sendInquiryNotification(reference, apiKey, recipient, fetchImpl = fetch) {
  if (!["bmarko@gmail.com", "couplesalarm.support@gmail.com"].includes(recipient)) throw Error("Notification recipient not configured");
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `work-inquiry/${reference}` },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      from: "Couples Alarm <onboarding@resend.dev>", to: [recipient],
      subject: "New Couples Alarm collaboration inquiry",
      text: `A collaboration inquiry was recorded.\n\nReference: ${reference}\n\nReview privately in the couples_alarm_work_inquiries table:\nhttps://supabase.com/dashboard/project/xqdqgsbkapvlskcldmpe/editor`,
    }),
  });
  if (!response.ok) throw Error("Notification unavailable");
}
