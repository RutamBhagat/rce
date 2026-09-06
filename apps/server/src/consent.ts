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
    <html class="min-h-full bg-shell" lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>Authorize RCE</title>
        <link rel="stylesheet" href="/consent.css" />
      </head>
      <body class="min-h-full bg-shell font-sans text-ink antialiased">
        <main class="min-h-screen px-5 py-8 sm:px-8 sm:py-12">
          <div class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center sm:min-h-[calc(100vh-6rem)]">
            <section class="w-full overflow-hidden rounded-[2rem] border border-ink/10 bg-paper shadow-[0_30px_80px_-40px_rgba(21,32,43,0.45)]">
              <div class="grid lg:grid-cols-[16rem_minmax(0,1fr)]">
                <aside class="flex flex-col justify-between border-b border-white/10 bg-ink p-6 text-paper sm:p-8 lg:min-h-[40rem] lg:border-r lg:border-b-0">
                  <div>
                    <p class="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-paper/55">RCE / local access</p>
                    <p class="mt-6 max-w-40 text-2xl font-semibold leading-[1.05] tracking-[-0.03em]">Your terminal is the source of truth.</p>
                  </div>
                  <div class="mt-12 border-t border-white/10 pt-5 font-mono text-xs leading-5 text-paper/55">
                    <p>OAuth-protected MCP</p>
                    <p>Session ends when RCE stops</p>
                  </div>
                </aside>

                <div class="p-6 sm:p-8 lg:p-10">
                  <header class="max-w-2xl">
                    <p class="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-signal">Authorization request</p>
                    <h1 class="mt-3 text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-5xl">Allow this client to control this folder?</h1>
                    <p class="mt-5 max-w-xl text-[0.98rem] leading-6 text-slate">Authorize only if the verification code below matches the code printed by the RCE process you started.</p>
                  </header>

                  <dl class="mt-8 grid gap-x-6 gap-y-5 border-y border-ink/10 py-5 sm:grid-cols-2">
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

                  <section aria-labelledby="verify-title" class="mt-8 rounded-[1.5rem] bg-ink px-5 py-5 text-paper sm:px-6 sm:py-6">
                    <div class="flex items-start justify-between gap-6">
                      <div>
                        <p id="verify-title" class="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-paper/55">Verify in terminal</p>
                        <p class="mt-1 text-sm leading-5 text-paper/65">Approve only when this code matches exactly.</p>
                      </div>
                      <span class="mt-1 size-2.5 shrink-0 rounded-full bg-signal ring-4 ring-signal/20" aria-hidden="true"></span>
                    </div>
                    <p class="mt-6 overflow-hidden font-mono text-[clamp(1.05rem,5vw,3.7rem)] font-semibold leading-none tracking-[0.08em] text-white">${approvalCode}</p>
                  </section>

                  <p class="mt-4 max-w-2xl text-sm leading-5 text-slate">Authorization grants local file editing and shell access for this RCE process inside the selected workspace.</p>

                  <form class="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end" method="post">
                    ${fields.map(([name, value]) => hiddenField(name, value))}
                    <button class="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 bg-transparent px-5 text-sm font-semibold text-ink transition hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal motion-reduce:transition-none" formaction="${action}/deny">Deny</button>
                    <button class="inline-flex min-h-11 items-center justify-center rounded-full bg-signal px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(39,84,216,0.9)] transition hover:bg-signal/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal motion-reduce:transition-none" formaction="${action}/approve">Authorize access</button>
                  </form>
                </div>
              </div>
            </section>
          </div>
        </main>
      </body>
    </html>`;
}
