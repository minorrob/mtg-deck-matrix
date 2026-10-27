/* THE INVITATION EMAIL (Rob, 2026-10-26: "a professional-looking HTML email ... inviting them to log in to CrankMagic").
   Sent as HTML with a plain-text twin, so a client that shows no HTML still has the words and the link.

   INVITE_HTML is the template. It is this repository's own placeholder until Claude Design's version comes back
   (docs/design/invite-email/BRIEF.md says what was asked); that version replaces the string whole and keeps its
   three tokens, each filled here and nowhere else:
     {{name}}    the invitee's name as the administrator typed it, HTML-escaped
     {{link}}    the sign-in link, HTML-escaped
     {{assets}}  https://crankmagic.com/assets, where the email's pictures are served: production's public pages, never
                 staging (behind Access, so a mail client could not load them). The design's own pictures go in
                 assets/email/ and reach production with a release before the template that names them.
   Email-safe on purpose: tables for layout, inline styles, PNG or JPEG only (no WebP, no SVG, no web fonts relied on),
   600 px wide, readable with pictures off. */
export const INVITE_SUBJECT = 'You are invited to CrankMagic';
export const INVITE_ASSETS = 'https://crankmagic.com/assets';
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

export function inviteText({name, link}) {
  return `Hi ${name},\n\nYou are invited to CrankMagic. Sign in with this email address to use your profile, build decks and play.\n\n${link}`;
}

export function inviteHtml({name, link}) {
  const values = {name: escape(name), link: escape(link), assets: INVITE_ASSETS};
  return INVITE_HTML.replace(/\{\{(name|link|assets)\}\}/g, (_, key) => values[key]);
}

export const INVITE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>You are invited to CrankMagic</title>
</head>
<body style="margin:0;padding:0;background:#0b1220;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your seat at the table is ready. Sign in to build decks and play Commander.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b1220;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#121b2e;border:1px solid #24324f;border-radius:14px;">
      <tr><td align="center" style="padding:36px 32px 8px;">
        <img src="{{assets}}/crankmagic/apple-touch-icon.png" width="72" height="72" alt="CrankMagic" style="display:block;border:0;border-radius:16px;">
      </td></tr>
      <tr><td align="center" style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:34px;font-weight:700;color:#86cdff;letter-spacing:-0.5px;">CrankMagic</td></tr>
      <tr><td style="padding:28px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:26px;color:#e8eefc;">Hi {{name}},</td></tr>
      <tr><td style="padding:12px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#c4cee3;">You are invited to CrankMagic: build and tune Commander decks, track your collection and play at the table, with an AI coach beside you.</td></tr>
      <tr><td style="padding:12px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#c4cee3;">Sign in with <strong style="color:#e8eefc;">this email address</strong> to get started.</td></tr>
      <tr><td align="center" style="padding:32px 40px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#1456b8" style="border-radius:10px;">
            <a href="{{link}}" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Sign in to CrankMagic</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:20px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8a97b3;">If the button does not work, copy this link into your browser:<br><a href="{{link}}" style="color:#86cdff;word-break:break-all;">{{link}}</a></td></tr>
      <tr><td style="padding:28px 40px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6f7c98;border-top:1px solid #24324f;">
        You received this because the CrankMagic administrator invited this address. If you were not expecting it, you can ignore this email.<br><br>
        CrankMagic is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. &copy;Wizards of the Coast LLC.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
