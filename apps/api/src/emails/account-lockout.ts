/**
 * Account lockout warning email template.
 * Sent when a user's account is locked after too many failed login attempts.
 * Returns both HTML and plain-text versions.
 */
export function accountLockoutEmail(params: {
  lockoutDurationMinutes: number;
  resetPasswordUrl: string;
}): { html: string; text: string } {
  const { lockoutDurationMinutes, resetPasswordUrl } = params;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account Locked</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f7f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f7f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);padding:40px;">
          <tr>
            <td style="font-size:22px;font-weight:700;color:#c0392b;padding-bottom:16px;">
              Account Temporarily Locked
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:1.6;color:#4a4843;padding-bottom:16px;">
              Your Calley account has been temporarily locked due to multiple failed login attempts. This is a security measure to protect your account.
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:1.6;color:#4a4843;padding-bottom:24px;">
              Your account will be automatically unlocked in <strong>${lockoutDurationMinutes} minutes</strong>. If you did not make these login attempts, we recommend resetting your password immediately.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <a href="${resetPasswordUrl}" style="display:inline-block;padding:12px 28px;background-color:#c8522a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                Reset Your Password
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;line-height:1.5;color:#7a7570;padding-bottom:16px;">
              If this was you, you can simply wait for the lockout period to expire and try again with the correct password.
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;line-height:1.5;color:#a09a94;border-top:1px solid #e4e2dd;padding-top:16px;">
              If the button above doesn't work, copy and paste this link into your browser:<br />
              <a href="${resetPasswordUrl}" style="color:#c8522a;word-break:break-all;">${resetPasswordUrl}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Account Temporarily Locked

Your Calley account has been temporarily locked due to multiple failed login attempts. This is a security measure to protect your account.

Your account will be automatically unlocked in ${lockoutDurationMinutes} minutes. If you did not make these login attempts, we recommend resetting your password immediately.

Reset your password: ${resetPasswordUrl}

If this was you, you can simply wait for the lockout period to expire and try again with the correct password.`;

  return { html, text };
}
