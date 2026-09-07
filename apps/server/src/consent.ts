import { html, type SafeHtml } from "@remix-run/html-template";

export const consentHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'self' https://chatgpt.com; frame-ancestors 'none'",
  "Referrer-Policy": "same-origin",
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
    <html class="min-h-full bg-paper" lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>Authorize RCE</title>
        <link rel="stylesheet" href="/consent.css" />
      </head>
      <body class="min-h-full bg-paper font-sans text-ink antialiased">
        <main class="min-h-screen lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside class="flex flex-col justify-between border-b border-white/10 bg-ink px-5 py-7 text-paper sm:px-8 lg:min-h-screen lg:border-r lg:border-b-0 lg:px-8 lg:py-10">
            <div>
              <p class="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-paper/55">RCE</p>
              <p class="mt-6 max-w-44 text-2xl font-semibold leading-[1.05] tracking-[-0.03em]">Local access, explicitly authorized.</p>
              <p class="mt-5 max-w-48 text-sm leading-6 text-paper/60">RCE exposes this workspace to the client through an OAuth-protected MCP session.</p>
            </div>
            <div class="mt-10 border-t border-white/10 pt-5 font-mono text-xs leading-5 text-paper/55 lg:mt-16">
              <p>Verify the terminal code</p>
              <p>Session ends when RCE stops</p>
            </div>
          </aside>

          <section class="px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-14 xl:px-16">
            <div class="mx-auto max-w-3xl lg:mx-0">
              <header class="max-w-2xl">
                <p class="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-signal">Authorization request</p>
                <h1 class="mt-3 text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-5xl">Authorize RCE</h1>
                <p class="mt-5 max-w-xl text-[0.98rem] leading-6 text-slate">Allow this client to edit files and run commands in the selected workspace. Authorize only if the verification code below matches the code printed by the RCE process you started.</p>
              </header>

              <dl class="mt-10 grid gap-x-8 gap-y-6 border-y border-ink/10 py-6 sm:grid-cols-2">
                <div>
                  <dt class="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate">Client</dt>
                  <dd class="mt-1.5 break-all font-mono text-xs leading-5 text-ink sm:text-sm">${clientName}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate">Workspace</dt>
                  <dd class="mt-1.5 break-all font-mono text-xs leading-5 text-ink sm:text-sm">${directory}</dd>
                </div>
                <div class="sm:col-span-2">
                  <dt class="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate">Return URL</dt>
                  <dd class="mt-1.5 break-all font-mono text-xs leading-5 text-slate">${redirectUri}</dd>
                </div>
              </dl>

              <section aria-labelledby="verify-title" class="mt-8 rounded-[1.25rem] border border-ink/10 bg-shell/55 px-5 py-5 sm:px-6 sm:py-6">
                <div class="flex items-start justify-between gap-6">
                  <div>
                    <p id="verify-title" class="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-slate">Verification code</p>
                    <p class="mt-1 text-sm leading-5 text-slate">Approve only when this code matches exactly.</p>
                  </div>
                  <span class="mt-1 size-2.5 shrink-0 rounded-full bg-signal ring-4 ring-signal/15" aria-hidden="true"></span>
                </div>
                <p class="mt-6 overflow-hidden font-mono text-[clamp(1.35rem,6vw,3.4rem)] font-semibold leading-none tracking-[0.08em] text-ink">${approvalCode}</p>
              </section>

              <p class="mt-4 max-w-2xl text-sm leading-5 text-slate">Authorization is scoped to this RCE process and selected workspace.</p>

              <form class="mt-9 flex flex-col-reverse gap-3 border-t border-ink/10 pt-6 sm:flex-row sm:justify-end" method="post">
                ${fields.map(([name, value]) => hiddenField(name, value))}
                <button class="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-transparent px-5 text-sm font-semibold text-ink transition hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal motion-reduce:transition-none" formaction="${action}/deny">Deny</button>
                <button class="inline-flex min-h-11 items-center justify-center rounded-full bg-signal px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(39,84,216,0.9)] transition hover:bg-signal/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal motion-reduce:transition-none" formaction="${action}/approve">Authorize access</button>
              </form>
            </div>
          </section>
        </main>
      </body>
    </html>`;
}
