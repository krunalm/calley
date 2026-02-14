/**
 * Password reset email template.
 * Returns both HTML and plain-text versions.
 */
export function passwordResetEmail(params: { resetUrl: string; expiresInMinutes: number }) {
  const { resetUrl, expiresInMinutes } = params;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f7f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f7f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);padding:40px;">
          <tr>
            <td style="font-size:22px;font-weight:700;color:#1a1916;padding-bottom:16px;">
              Reset Your Password
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:1.6;color:#4a4843;padding-bottom:24px;">
              We received a request to reset your Calley account password. Click the button below to choose a new password.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background-color:#c8522a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                Reset Password
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;line-height:1.5;color:#7a7570;padding-bottom:16px;">
              This link will expire in ${expiresInMinutes} minutes. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;line-height:1.5;color:#a09a94;border-top:1px solid #e4e2dd;padding-top:16px;">
              If the button above doesn't work, copy and paste this link into your browser:<br />
              <a href="${resetUrl}" style="color:#c8522a;word-break:break-all;">${resetUrl}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Reset Your Password

We received a request to reset your Calley account password.

Click the link below to choose a new password:

${resetUrl}

This link will expire in ${expiresInMinutes} minutes.

If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.`;

  return { html, text };
}
