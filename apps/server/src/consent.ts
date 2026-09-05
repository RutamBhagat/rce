import { html, type SafeHtml } from "@remix-run/html-template";

export const consentHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

type ConsentPageProps = {
  clientName: string;
  directory: string;
  redirectUri: string;
  approvalCode: string;
  action: string;
  fields: ReadonlyArray<readonly [string, string]>;
};

function hiddenField(name: string, value: string): SafeHtml {
  return html`<input type="hidden" name="${name}" value="${value}" />`;
}

export function consentPage({
  clientName,
  directory,
  redirectUri,
  approvalCode,
  action,
  fields,
}: ConsentPageProps): SafeHtml {
  return html`<!doctype html>
    <html lang="en">
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Authorize RCE</title>
      <main>
        <h1>Authorize RCE</h1>
        <p><strong>${clientName}</strong> requests access to:</p>
        <p><code>${directory}</code></p>
        <p>Redirect: <code>${redirectUri}</code></p>
        <p>Confirm that your terminal shows this session code:</p>
        <p>
          <strong><code>${approvalCode}</code></strong>
        </p>
        <form method="post">
          ${fields.map(([name, value]) => hiddenField(name, value))}
          <button formaction="${action}/approve">Authorize</button>
          <button formaction="${action}/deny">Deny</button>
        </form>
      </main>
    </html>`;
}
