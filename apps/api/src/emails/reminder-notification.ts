/**
 * Escape a string for safe insertion into HTML content.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reminder notification email template.
 * Returns both HTML and plain-text versions.
 */
export function reminderNotificationEmail(params: {
  itemType: 'event' | 'task';
  title: string;
  time: string;
  minutesBefore: number;
  appUrl: string;
}): { html: string; text: string } {
  const { itemType, title, time, minutesBefore, appUrl } = params;

  const itemLabel = itemType === 'event' ? 'Event' : 'Task';

  let timingLabel: string;
  if (minutesBefore === 0) {
    timingLabel = 'starting now';
  } else if (minutesBefore < 60) {
    timingLabel = `in ${minutesBefore} minute${minutesBefore > 1 ? 's' : ''}`;
  } else if (minutesBefore < 1440) {
    const hours = Math.round(minutesBefore / 60);
    timingLabel = `in ${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    const days = Math.round(minutesBefore / 1440);
    timingLabel = `in ${days} day${days > 1 ? 's' : ''}`;
  }

  // Escape user-controlled values for safe HTML insertion
  const safeTitle = escapeHtml(title);
  const safeTime = escapeHtml(time);
  const safeAppUrl = encodeURI(appUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reminder: ${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f7f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f7f4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.06);padding:40px;">
          <tr>
            <td style="font-size:22px;font-weight:700;color:#1a1916;padding-bottom:16px;">
              ${itemLabel} Reminder
            </td>
          </tr>
          <tr>
            <td style="font-size:18px;font-weight:600;color:#1a1916;padding-bottom:8px;">
              ${safeTitle}
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:1.6;color:#4a4843;padding-bottom:24px;">
              ${itemType === 'event' ? 'Starts' : 'Due'} ${timingLabel} &mdash; ${safeTime}
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <a href="${safeAppUrl}" style="display:inline-block;padding:12px 28px;background-color:#c8522a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                View ${itemLabel}
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;line-height:1.5;color:#a09a94;border-top:1px solid #e4e2dd;padding-top:16px;">
              You're receiving this because you set a reminder in Calley.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${itemLabel} Reminder: ${title}

${itemType === 'event' ? 'Starts' : 'Due'} ${timingLabel} — ${time}

View in Calley: ${appUrl}

You're receiving this because you set a reminder in Calley.`;

  return { html, text };
}
