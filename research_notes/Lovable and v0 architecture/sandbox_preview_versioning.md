# Sandbox / Preview Infrastructure and Version History: Lovable, v0, bolt.new

Research date: 2026-10-01. Confidence tags: [HIGH] = primary vendor doc/blog read directly; [MED] = primary source via search snippet or credible vendor-partner post; [LOW] = third-party/aggregator or unverified.

## Lovable: where dev servers run, previews, HMR, log capture, scale

### Takeaway
Lovable runs every generation/edit session in a Modal Sandbox, reached via Modal's encrypted Tunnels. It moved there in 2025 from a "distributed cloud VM platform" (widely believed to be Fly.io Machines) and replaced a ~15k LOC in-house K8s/AWS orchestrator with ~700 LOC. For console and network capture, the documented mechanism is an agent-driven remote headless browser pointed at the preview. Lovable doesn't publicly document an in-iframe log bridge.

### Cited Findings
- [HIGH] Modal Sandboxes serve "every app generation session in Lovable"; each sandbox session powers one app generation. — [Modal case study](https://modal.com/blog/lovable-case-study)
- [HIGH] Each Lovable sandbox uses an encrypted Modal **Tunnel** so the client can talk to the server running inside the sandbox; Modal runs "a fleet of TCP relays around the globe". — [Modal case study](https://modal.com/blog/lovable-case-study)
- [HIGH] Scale: 250,000 apps created in 48h (June 2025 promo weekend), >1M sandboxes run over the event, **20,000 peak concurrent sandboxes**, concurrent sessions up 2.5–3x. Published 2025-07-07. — [Modal case study](https://modal.com/blog/lovable-case-study)
- [HIGH] The previous provider was a "distributed cloud VM platform" that raised scalability/operational-risk concerns. Lovable also built an internal Kubernetes/AWS solution with "15,000 lines of sandbox orchestration code". Moving to Modal cut that to about 700 lines. At the time, Lovable planned to adopt Modal's snapshotting for performance. — [Modal case study](https://modal.com/blog/lovable-case-study)
- [LOW] A third-party Medium post says every live preview ran in a Fly.io Machine (Node.js, 512 MB RAM, 1 CPU) running the dev server (Vite etc.). Because the machines had only private IPv6, a dedicated router app on Fly forwarded preview traffic. The page returned 403 to direct fetch, so this comes from the search snippet only. — [Medium (Shantanu Pawar)](https://medium.com/@shantanupawar101/how-loavble-delivers-real-time-code-previews-using-fly-io-e0a24dd7af29)
- [MED] Fly.io's own blueprint describes the matching pattern: a Coordinator/Router app relays requests to per-user machines using the `fly-replay` header, and the proxy starts a stopped machine on request. Typical setup is a management HTTP service (port 9090, receives LLM code changes and health checks) plus a public service (port 4443) for live previews and MCP. Lovable isn't named in the snippet. — [Fly.io docs: Connecting to user machines](https://docs.fly.io/blueprints/connecting-to-user-machines/)
- [HIGH] Browser testing uses "a real browser running in a remote virtual environment" (not the user's browser) against the current project's preview, or the test-environment preview when test/live are split. It can screenshot, click, fill forms, navigate, "read console logs and network requests", "detect runtime errors while interacting", and test mobile/tablet/desktop sizes. — [Lovable docs: Browser testing](https://docs.lovable.dev/features/browser-testing)
- [MED] Signals the agent can use when its tools run: browser console logs and network requests from browser testing, test failures and build errors, and request/response data from calling backend functions directly. — [Lovable docs: Agent/Build mode](https://docs.lovable.dev/features/agent-mode) (via search snippet)
- [MED] Agent Mode (beta, 2025) could "inspect logs and network activity to identify and debug errors without you needing to feed in the errors yourself". — [Lovable blog: Agent Mode beta](https://lovable.dev/blog/agent-mode-beta) (via search snippet)
- [MED] Lovable also logs errors to Cloud tab → Logs (agent and deployment errors), and tells users to open DevTools Console for debugging. — [Lovable FAQ: check console logs](https://lovable.dev/faq/development/best-practices/check-console-logs) (snippet)

### Inferences
- The "distributed cloud VM platform" Lovable left is almost certainly Fly.io Machines, given the Medium post and Fly's blueprint. Lovable doesn't name it. Treat the migration timeline (Fly, then own K8s, then Modal by mid-2025) as plausible but unconfirmed.
- Architecture shape: one ephemeral sandbox per active editing session, not per project forever. Code lives in Lovable's store/git, and the sandbox is re-hydrated on demand. That points the podman design toward idle-stop plus fast re-create, not always-on containers.
- The preview is almost certainly a Vite dev server with HMR proxied through the tunnel/router (Lovable apps are Vite + React). I found no primary doc confirming the HMR/WebSocket proxying details.
- Log capture: publicly, Lovable relies on (a) dev-server/build output from the sandbox and (b) a separate headless browser session for runtime console and network data. For the self-hosted clone, the cheap equivalent is Playwright against the container's preview URL, plus an injected script in the preview that postMessages console/error events to the parent.

### Gaps
- I found no cold-start or time-to-preview numbers from Lovable or Modal.
- HMR proxying, the preview domain scheme (e.g. `id-preview--*.lovable.app`), and whether the editor iframe injects a console-forwarding script are all undocumented in primary sources I could find.
- No Lovable engineering post confirming Fly.io by name.

## v0: Vercel Sandbox lifecycle, snapshots, ports, logs, pricing

### Takeaway
v0 moved in two steps. The old v1 preview was "next-lite", which emulated Next.js in the browser iframe. The v2 / "new v0" (Feb 2026) previews run in Vercel Sandbox, where each sandbox is a Firecracker microVM with its own kernel. Sandboxes are persistent by default: the filesystem is snapshotted automatically on stop and resumed on the next call. Processes do not survive, so the dev server must be restarted after resume. In-browser console forwarding existed for next-lite, but VM-backed previews do not expose it through the same channel.

### Cited Findings
- [HIGH] "The new v0" (2026-02-03) uses a "sandbox-based runtime" that can import any GitHub repo and pull env vars/config from Vercel. It has a Git panel with a branch per chat, PRs against main, and deploy on merge. — [Vercel blog: Introducing the new v0](https://vercel.com/blog/introducing-the-new-v0)
- [MED] Previews run the full app (server code, API routes, DB connections, env vars). "Under the hood, v0 uses Vercel Sandbox—a lightweight virtual machine". — [Vercel blog](https://vercel.com/blog/introducing-the-new-v0) (via search snippet)
- [HIGH] Each sandbox is a Firecracker microVM with a dedicated kernel. It boots Ubuntu 26.04, a custom image from Vercel Container Registry, or a snapshot. Default region is iad1, with 19 regions available. The docs claim startup in "milliseconds". — [Vercel docs: Understanding Sandboxes](https://vercel.com/docs/sandbox/concepts), [Pricing](https://vercel.com/docs/sandbox/pricing)
- [HIGH] Lifecycle is provision → running session → stop (timeout or `stop()`) → auto-snapshot of the **filesystem** for persistent sandboxes → the next SDK call (`runCommand`/`writeFiles`) resumes a new session from the latest snapshot. Sandboxes are addressed by a name unique per project (`Sandbox.get`/`getOrCreate`). — [Vercel docs: concepts](https://vercel.com/docs/sandbox/concepts)
- [HIGH] Only the filesystem is saved; running processes do not survive stop/resume. — [Vercel docs snippet, concepts/persistence](https://vercel.com/docs/sandbox/concepts)
- [HIGH] The dev server runs as a detached command (`runCommand({cmd:'npm', args:['run','dev'], detached:true})`), and logs stream via `for await (const log of cmd.logs())`. Exposed ports are reachable via a public URL. — [Vercel docs: concepts](https://vercel.com/docs/sandbox/concepts)
- [HIGH] Snapshots expire 30 days after last use by default (configurable, or 0 for never). `keepLastSnapshots` keeps the 1–10 most recent. `Sandbox.fork` spawns a sandbox from another's state. Snapshots are region-bound. Restoring an uncached snapshot takes longer. Taking a manual snapshot stops the sandbox. — [Vercel docs: Snapshots](https://vercel.com/docs/sandbox/concepts/snapshots)
- [HIGH] Limits and pricing (docs updated 2026-09-10):
  - Default timeout is 5 min. Max session is 45 min on Hobby and 24 h on Pro/Enterprise. The max applies per session, so a persistent sandbox's total lifetime is effectively unbounded.
  - Default size is 2 vCPU, with 2 GB RAM per vCPU. Pro max is 8 vCPU/16 GB, and every plan allows 15 open ports and 64 GB NVMe.
  - Concurrency is 10 sandboxes on Hobby and 10,000 on Pro.
  - Pro rates: Active CPU $0.128/h (I/O wait not billed), memory $0.0212/GB-h, $0.60 per 1M creations, snapshot storage $0.08/GB-month. Traffic to and from exposed ports is billable, but downloads such as npm installs are free.
  - Pro vCPU allocation starts at 150/min and ramps to 5,000/min.
  - Source: [Vercel docs: Sandbox pricing](https://vercel.com/docs/sandbox/pricing)
- [HIGH] v0 API v1 previews ran in the "next-lite" runtime, which emulates Next.js client and server in the browser iframe. Console output (log/info/warn/error/debug, uncaught errors, unhandled rejections) is forwarded via a `postMessage` handshake that sets up a `MessageChannel`, using the `bidc` package. Each event carries a pre-stringified message, an ISO timestamp, the method, and an `isServer` flag, with noisy framework messages filtered. "API v2 uses VM-backed previews and does not expose console output through this next-lite channel." — [v0 docs: Capturing preview console logs](https://v0.app/docs/api/v1/guides/capturing-preview-console-logs)
- [MED] Users complained in Feb 2026 that previews now forced a new tab, which removed console-log access and left the v0 agent unable to self-debug. Vercel staff gave no architectural explanation. — [Vercel community thread](https://community.vercel.com/t/v0-forced-new-tab-preview-prevents-console-log-access-and-agent-debugging/33597)
- [LOW] Vercel's community forum has many sandbox preview failure reports (e.g. "next: command not found", stuck spinners, Internal Server Error), which suggests dependency install/boot on resume is a real failure mode. — [community thread 1](https://community.vercel.com/t/v0-preview-fails-with-sh-line-1-next-command-not-found-error-in-sandbox/36324?page=2), [community thread 2](https://community.vercel.com/t/issues-with-v0-previews/38627)

### Inferences
- There is no port auto-detection in the SDK. The caller knows which port it started the dev server on and asks for that port's public URL; open-lovable, for example, hardcodes 5173 for Vite. "Preview port detection" in v0 is most likely convention-based (a known framework port) or log-scraping ("Local: http://localhost:XXXX").
- Persistence at the filesystem level, with processes restarted on resume, maps directly onto podman: `podman stop`/`start` keeps the container's writable layer, and an entrypoint relaunches `vite`. You get Vercel's model for free.
- Moving from in-browser next-lite to VMs cost v0 its in-iframe console bridge, which shows the bridge has to be built deliberately. For the clone: inject a small script into the Vite `index.html` via a dev-only plugin that forwards console, errors, and fetch results to the parent frame over `postMessage`, and also stream the dev-server stdout from the container.

### Gaps
- `v0_debug_logs` isn't mentioned in any source I found. Its format and mechanism are unverified.
- There are no published v0-specific cold-start or resume-latency numbers. The docs only say startup takes "milliseconds" and that resuming from a snapshot is faster than a fresh start.
- I didn't verify the public URL format for exposed ports (`sandbox.domain(port)`).

## bolt.new (commercial): WebContainers, Bolt Cloud, hosting; vs bolt.diy

### Takeaway
bolt.new still runs the development environment (Node, npm, dev server, terminal) client-side in StackBlitz WebContainers inside the user's browser tab. There is no per-project server-side dev container. Bolt Cloud (Bolt V2, Aug/Sep 2025) added server-side hosting, a built-in database, auth, storage, edge functions, and analytics. I found no evidence that bolt.new moved dev execution to server-side sandboxes.

### Cited Findings
- [LOW] WebContainers run the filesystem, terminal, package manager, and dev server entirely in the browser tab. — [taskade review](https://www.taskade.com/blog/bolt-review), [aitoolgrade](https://aitoolgrade.com/review/bolt.html)
- [LOW] Bolt Cloud launched in Aug/Sep 2025 (sources disagree on the month) with built-in DB, auth, file storage, edge functions, hosting with custom domains, and analytics. Every project gets a database space. — [taskade review](https://www.taskade.com/blog/bolt-review); a conflicting "September 2025" date appears in [aipedia](https://www.aipedia.wiki/tools/bolt/)
- [LOW] Bolt reached $40M ARR by March 2025. — [Sacra](https://sacra.com/c/bolt-new/)
- [MED] Evil Martians wrote a case study on bolt.new's WebContainer foundation. — [Evil Martians](https://evilmartians.com/chronicles/bolt-new-from-stackblitz-how-they-surfed-the-ai-wave-with-no-wipeouts) (not fetched)

### Inferences
- WebContainers make the preview cost for StackBlitz roughly zero, since the user's CPU runs the dev server. The price is browser constraints: no native binaries, and some npm packages break. The podman design trades that for server cost but gets full Linux compatibility.
- bolt.diy (the open-source fork) also runs on WebContainers but lacks Bolt Cloud, the managed DB, hosting, and commercial version history. This is from background knowledge and I didn't verify it this session.

### Gaps
- I found no primary StackBlitz engineering source for 2025–2026 on Bolt Cloud internals (which DB engine, where hosting runs).
- I didn't verify the bolt.diy vs bolt.new feature diff against primary sources.

## Version history, restore semantics, DB state on restore, anti-"stuck" features

### Takeaway
All three auto-version on every AI edit. On restore, v0 documents append semantics: restoring creates a new latest version, keeping history linear. Lovable says reverting is "not destructive to your chat" and later edits stay reapplicable. Bolt restores with a preview-first flow plus rename and bookmark. On database state, **Lovable and Bolt both explicitly say restore is code-only and does not roll back database data or migrations.** Lovable additionally redeploys edge functions to match the restored code. Nobody reverts the DB.

### Cited Findings
- [HIGH] Lovable: "Every change Lovable makes to your project creates a version automatically. There is no save button." — [Lovable docs: History](https://docs.lovable.dev/features/projects/history)
- [HIGH] Lovable: "Reverting restores your project to how it was at that version. It is not destructive to your chat: the conversation continues from where you are." and "the edits made after that point stay in the project chat, so you can reapply them anytime." — [Lovable docs: History](https://docs.lovable.dev/features/projects/history)
- [HIGH] Lovable DB warning: "Reverting restores your project's **code only**, and redeploys your app's edge functions to match. It does not restore or roll back your **database data**." If later messages added records, changed data, or ran migrations, reverting does not undo them. — [Lovable docs: History](https://docs.lovable.dev/features/projects/history)
- [HIGH] Other Lovable history features:
  - Bookmarks (from chat activity cards or the History panel, with their own tab).
  - "Open preview in new tab" for an old version.
  - "View code changes" (per-version diff).
  - A read-only "snapshot view" of a past state.
  - Revert is disabled when you're already on that version, for pre-remix versions of Cloud-backed projects, or when the version is too old ("Cannot revert this far back in history").
  - Credits are not refunded for reverted messages.
  - Source: [Lovable docs: History](https://docs.lovable.dev/features/projects/history)
- [LOW] Third parties add detail: the rollback leaves tables, columns, migrations, RLS policies, and rows in their new state. Supabase migrations are forward-only, so you undo one by writing a new reversing migration. — [hirelovableexperts](https://www.hirelovableexperts.com/fix/lovable-2-broke-my-app-rollback), [axonbuild](https://axonbuild.com/blog/database-migration-rollback)
- [HIGH] v0: each time v0 updates code from a message, it creates a version. Direct manual edits do **not** create versions. "Restoring an old version creates a new, most recent version using the restored code to maintain a linear version history." Deploy uses the latest version, so to deploy old code you restore it first. Each message has controls to inspect, diff, or restore. — [v0 docs: Versions](https://v0.app/docs/versions)
- [MED] The v0 API's restore-version works in place: it keeps the same chat ID and creates a new version entry pointing to the restored files. Fork makes a new chat instead. — [v0 API docs: restore version](https://v0.app/docs/api/v1/reference/chats/restore-version) (snippet)
- [LOW] Community threads show older v0 behavior and user confusion ("Restoring a previous version deletes all subsequent versions?") and failures ("Failed to Restore Version", forks failing to restore working versions). — [thread](https://community.vercel.com/t/restoring-a-previous-version-deletes-all-subsequent-versions/3679), [thread](https://community.vercel.com/t/v0-fails-to-restore-previous-working-versions-when-forking/32830)
- [HIGH] Bolt: versions are saved automatically. "View history" gives a timeline where you can preview, rename (pencil), bookmark (star, shown in "Bookmarked Versions"), and "Restore this version". You can also restore from chat history, restore a manual zip backup into a StackBlitz project, or use GitHub. — [Bolt support: Rollback & backup](https://support.bolt.new/building/using-bolt/rollback-backup)
- [HIGH] Bolt DB warning: "Restoring to an earlier project version will not change your current Bolt or Supabase databases." — [Bolt support: Rollback & backup](https://support.bolt.new/building/using-bolt/rollback-backup)

### Inferences
- The consensus UX for non-technical users:
  - Auto-version per AI turn, with no save button.
  - Restore appends a new head (v0 documents this; Lovable implies it by keeping later edits reapplicable). Never rewrite history.
  - Preview an old version before restoring.
  - Bookmarks or labels for "known good" states.
  - Per-version diff.
  - An explicit warning that data and schema aren't rolled back.
- In git terms: one commit per AI turn, and restore = `git checkout <sha> -- .` plus a new commit ("Restored to vN"), not `reset --hard`. Bookmarks = lightweight tags or DB rows referencing SHAs. That's cheap and never loses anything.
- Since nobody reverts the DB, the honest options are: (a) code-only restore with a warning (industry standard), or (b) something beyond the market, like per-version DB snapshots (e.g. SQLite file copy or `pg_dump` per commit) offered as an opt-in "also restore data". If the clone uses SQLite per project, (b) is cheap and would be a genuine differentiator.
- Anti-"stuck": the documented mechanisms are revert, bookmarks, and viewing old previews. The auto-fix loop (agent reads build/runtime errors) covers the rest. I found no "auto-restore to last working build" feature documented by any vendor.

### Gaps
- Lovable's docs don't say explicitly whether a revert appends a new head version or moves a pointer. The wording implies non-destructive behavior, but the mechanics are undocumented.
- Bolt's docs don't state whether restore discards later versions.
- None of the three says whether internal storage is git. Lovable's GitHub sync suggests git-backed storage, but that's unconfirmed.

## Download / export of project code

### Takeaway
Lovable offers two-way GitHub/GitLab sync on all plans, plus a ZIP download on paid plans. Bolt offers Export > Download (zip) and GitHub. v0 is git-centric since Feb 2026 (branch per chat, PRs).

### Cited Findings
- [MED] Lovable offers two-way GitHub/GitLab sync on every plan: Lovable edits push immediately, and GitHub edits flow back. A ZIP download from the Code tab is paid-only. Secrets aren't included in exports. — [Lovable FAQ: export](https://lovable.dev/faq/code-export/export-download-code) (snippet), [axonbuild](https://axonbuild.com/blog/lovable-export-code/)
- [HIGH] Bolt: click the project title, then Export > Download, to get a zip. Restoring means unzipping into a new StackBlitz project. GitHub import is also available. — [Bolt support](https://support.bolt.new/building/using-bolt/rollback-backup)
- [HIGH] v0: Git panel with a branch per chat, PRs, and deploy on merge. — [Vercel blog](https://vercel.com/blog/introducing-the-new-v0)

### Inferences
- For a no-GitHub product, `git archive --format=zip HEAD`, minus `.env`, is the one-line export. Secrets are excluded, matching industry practice.

### Gaps
- I didn't verify v0's zip download UI in 2026 docs.

## Open-source analogs and preview proxy structure

### Takeaway
open-lovable (Firecrawl) is a thin Next.js orchestrator over pluggable remote sandboxes (Vercel Sandbox by default, E2B as an alternative). It runs Vite on 5173 inside the sandbox and uses the provider's public port URL as the iframe src, with no custom proxy. Dyad runs locally (Electron) with git-committed edits. Fly's router/fly-replay blueprint is the reference design for self-managed per-user machine routing.

### Cited Findings
- [HIGH] open-lovable selects its sandbox with `SANDBOX_PROVIDER=vercel|e2b`. Vercel is the default. The app itself is Next.js. — [GitHub: firecrawl/open-lovable](https://github.com/firecrawl/open-lovable)
- [LOW] With both E2B and Vercel sandboxes, the preview URL comes from the provider's host/URL method for port 5173, where Vite runs. — [search summary incl. computesdk guides](https://computesdk.com/blog/how-to-run-your-first-e2b-sandbox)
- [MED] Dyad is a local, open-source (Electron) Lovable alternative with BYOK. Its XML-like tool protocol has tags for writing files, installing deps, running SQL migrations, and committing to Git. It ships six Git tools for the agent. — [OpenReplay intro](https://blog.openreplay.com/practical-intro-dyad-local-ai-app-builder/), [besthub review](https://www.besthub.dev/articles/dyad-review-21k-star-open-source-ai-builder-for-local-full-stack-development-2a07ab74b525)
- [MED] In the Fly.io pattern, a router uses `fly-replay` to steer requests to a specific user machine and auto-starts it if stopped. Management (9090) and public preview (4443) ports are kept separate. — [Fly.io docs](https://docs.fly.io/blueprints/connecting-to-user-machines/)
- [MED] Vercel's own comparison page positions Vercel Sandbox against E2B (Firecracker in both cases). — [Vercel KB: Sandbox vs E2B](https://vercel.com/kb/guide/vercel-sandbox-vs-e2b)

### Inferences
- The podman equivalent of the Fly router: a reverse proxy (Caddy/Traefik, or a small Node proxy) that maps `p-<id>.preview.host` to the container's port. On a miss it runs `podman start` and holds the request until Vite answers, which reproduces fly-replay auto-start. WebSocket upgrade must pass through for Vite HMR. Set `server.hmr.clientPort`/`host` and `server.allowedHosts` in Vite when served behind a proxy on a different host or port.
- Keep a management channel (exec/file writes via the podman API) separate from the public preview port, as Fly's blueprint does.
- Podman containers share the host kernel. Vercel and E2B use Firecracker microVMs (Modal reportedly uses gVisor, which I did not verify this session), specifically because the code is untrusted. If you self-host with multiple tenants, consider gVisor (`runsc`) or Kata as the podman OCI runtime.

### Gaps
- I didn't fetch Dyad's preview-proxy source. Dyad reportedly uses a local proxy with an injected script for console and error capture, but that's unverified this session.
- Daytona wasn't researched due to the tool budget.
- E2B's port URL format and the Vercel `domain(port)` API weren't verified directly.
