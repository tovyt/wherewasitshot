type SendLoginEmailParams = {
  email: string;
  loginLink: string;
};

export async function sendLoginEmail({ email, loginLink }: SendLoginEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("Email not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }

  const payload = {
    from,
    to: email,
    subject: "Your login link",
    text: `Click to log in: ${loginLink}`,
    html: `<p>Click to log in:</p><p><a href="${loginLink}">${loginLink}</a></p>`
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email send failed: ${errorText}`);
  }
}
