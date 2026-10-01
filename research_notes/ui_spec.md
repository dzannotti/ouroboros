# UI/UX spec: Lovable and v0 (2025 to 2026), from screenshots

Researched 2026-10-01. Logged out only, no accounts. Each observation is tagged:

- **[seen]**: I looked at a screenshot or video frame myself (URL given).
- **[docs]**: the official docs text says so, but I found no screenshot. Treat sizes and colors here as unverified.

Pixel sizes come from 1280 to 1920px-wide captures and are approximate. Both products ship light and dark themes. Lovable's editor screenshots are mostly cream/light, with dark ones from 2025. v0's are mostly dark, with light marketing shots.

**Both products changed a lot in this window.**
- **Lovable:** the 2025 "Visual edits" side panel became the "preview toolbar" (select, inline text, draw, comment). "Agent mode" became "Build mode". "Chat | History" tabs became a History toggle plus a Details view.
- **v0:** relaunched on 2026-02-03 ("new v0": Projects, Git, VM sandbox previews, a full editor). The left icon rail has since been partly folded into the preview toolbar's mode tabs (Preview / Design / Code / Database). Where these differ, both versions are described below.

Main sources:
- Lovable: docs.lovable.dev (feature pages and changelog images), lovable.dev/blog (GIFs: `a-smarter-lovable`, `chat-mode-and-questions`, `visual-edits`, `versioning-with-lovable-two-point-zero`, `anthropic-sonnet-3-7-lovable-diff-viewer`, `agent-mode-beta`, `lovable-cloud`), lovable.dev homepage.
- v0: v0.app homepage, v0.app/docs (llms.txt plus images and videos at `4nwqv0zkit3b9v6h.public.blob.vercel-storage.com`), v0.app/changelog (videos at `pdgvvgmkdvyeydso.public.blob.vercel-storage.com/changelog/*`), vercel.com/blog/introducing-the-new-v0.

---

# PART A: LOVABLE

## A1. Home / dashboard

### Logged-out landing (https://lovable.dev) [seen]
- **Top nav:** Lovable logo at left (heart icon with an orange, pink and purple gradient, plus a bold "Lovable" wordmark).
  - Links: Solutions ▾, Resources ▾, Community, Enterprise, Pricing, Security.
  - Right: "Log in" (white, 1px border, small radius) and "Get started" (black fill, white text).
- **Hero background:** full-bleed soft gradient. Off-white/cream at the top (#f9f8f5-ish), a band of saturated blue, then pink/magenta, then orange/red at the bottom. It reads as a glowing horizon.
- **Headline:** "Build something Lovable" (about 48px, bold, tight tracking, near-black).
- **Subhead:** "Bring a new product, internal tool, or entire company to life." (about 18px, gray).
- **Prompt box:** about 600px wide and about 100px tall. White, radius about 24px, soft shadow, no visible border.
  - Placeholder is an animated typewriter, e.g. "Ask Lovable to create a landing page for my…".
  - Bottom row, left: a circular outlined "+" button (aria "Additional actions").
  - Bottom row, right: a "Build ▾" mode dropdown (plain gray text) and a mic icon ("Transcribe").
  - The send button appears once there is text.
- **Cookie banner:** a white rounded card at the bottom-right.

### Logged-in dashboard [seen]
Sources:
- https://mintcdn.com/lovable-f9060f1e/C0rCCrr6cuHOMeZL/images/lovable-dashboard.png (on https://docs.lovable.dev/introduction/dashboard-overview)
- welcome-lovable-dashboard.png (https://docs.lovable.dev/introduction/welcome)
- changelog image 2025-dec-10-new-dashborad.png (https://docs.lovable.dev/changelog)

**Left sidebar** (about 300px at 1920 wide, about 16%)
- Cream/off-white background with no hard border, so the main area's gradient starts at its edge.
- Top: heart logo, with a collapse-sidebar icon (panel glyph) at the top-right. Shortcuts: `[` or Cmd+B.
- Workspace switcher: a bordered rounded row (about 40px). It holds a colored square avatar with an initial (orange "I", blue "F"), the workspace name, and ⌄.
  - Its menu shows a credit bar plus "Personal usage" [docs].
- Nav items (icon 16px + label 15px, row about 40px; the active row has a light-gray rounded fill):
  - Home
  - Search (with ⌘K keycaps shown at right)
  - Resources
  - Connectors
  - "Chats" appears once you've started a chat [docs].
- Muted section label "Projects": All projects, Starred, Created by me, Shared with me.
  - The Dec-2025 variant groups "Resources" as Explore, Templates [Soon badge], Learn.
- Muted label "Recents": plain project names with no icons. Hovering a row shows ⋯ [docs].
- Bottom cards (white, bordered, radius about 12px):
  - "Share Lovable / 100 credits per paid referral" with a gift icon in a circle.
  - "Upgrade to Pro / Unlock more features" with a lightning icon in a lavender circle.
- Bottom row: user avatar circle at left (badge for notification count) and an inbox icon at right (red dot when there is something new).

**Main area**
- Full-height gradient: blue/lilac top, pink middle, orange/red bottom.
- Optional announcement pill above the heading: a blue "New" chip plus "Lovable is now on Telegram →".
- Greeting heading, centered (about 36px semibold): "Ready to build, Ines?", "Let's build something, Gemma", "Let's build something Lovable", or, in Chat mode, "Got an idea, Ines?".
- **Prompt box** (about 790px wide, cream-white, radius about 28px, soft shadow):
  - Placeholder rotates: "Ask Lovable to create a prototype…" / "…a blog about…" / "…an internal tool that…".
  - Bottom row, left to right:
    - "+" opens the Chat actions menu.
    - Optional chips, by era:
      - Early-2026 GIF: "📎 Attach", "📄 Personal" (workspace/visibility), "Theme ▾".
      - Business plans: "🔒 Restricted" / "Workspace" / "Public" visibility chip.
      - 2025: "No theme ▾".
    - Right-aligned: mode text button "Build ▾" (or "Plan" / "Chat"), a waveform/mic icon, and the send button. Send is a 36px dark-gray circle with a white ↑ (disabled is lighter gray).
  - When Chat mode is active the mode label turns blue ("Chat ▾"). Send becomes a blue pill reading "Chat for free ↑". [seen, chats-dashboard-prompt-box.png, https://docs.lovable.dev/features/chats]
  - When Plan is chosen inside a project composer, "Plan" becomes a blue filled pill [seen].
- **"+" menu popover** (about 300px, white, radius 12px): a search field "Search…", then rows with icons and ›:
  - Attach (paperclip)
  - Design (palette)
  - Connectors
  - The highlighted row is a solid blue fill with white text.
  - [docs] adds: Databases, Take a screenshot, Import from Figma, Use a template.
- **Projects sheet:** a large white panel with radius about 32px on its top corners, rising from the bottom over the gradient. Scroll the page to reveal it.
  - Pill tab group: "My projects" (selected = white pill with border), "Recently viewed", "Shared with me", "Templates". At the right: "Browse all →".
  - Grid of project cards, 3 columns at 1920.
    - Each card is mostly a screenshot thumbnail (16:10, rounded about 12px, subtle border).
    - Below it [docs]: project name, a "Published" badge when live, and an edited-time line.
    - Hover shows a star and a ⋯ menu. Right-click opens the same menu, with groups Copy / Open / Move / Edit, Settings, and Delete [docs].
- Drag-select on empty space multi-selects cards and shows a bulk toolbar: Move to folder, Transfer, Change owner, Unpublish, Delete [docs].

## A2. Project / editor page layout

Sources:
- [seen] a-smarter-lovable GIFs (assets.lovable.dev/content/news/{plan-mode,queuing,automated-testing}.gif, early 2026)
- [seen] build-browser-testing.png (https://docs.lovable.dev/features/browser-testing)
- [seen] changelog 2025-nov-26-design-view.png and 2025-nov-18-visual-edits.png
- [docs] https://docs.lovable.dev/features/projects/editor

**Overall:** the app background is cream (light) or #1c1c1c (dark).
- **Chat panel:** fixed on the left, about 30 to 33% of width (about 400 to 460px at 1440, not resizable in the shots). No card border; it sits directly on the app background.
- **Preview:** fills the rest inside a white rounded card (radius about 12px, 1px border) inset by about 8px from the window edge.
- **Hide chat panel:** Cmd+B gives the preview the full width [docs].

**Header** (one row, about 44px, same background as the chat column; no divider in light mode):
- **Left, above the chat column:**
  - Lovable heart (it opens the sidebar on hover/click; there is a hamburger in the drafts docs image).
  - Project name in bold 14px with ⌄. Under it, a tiny muted status subtitle: "Loading Live Preview…" while booting, else nothing, or "View Project".
  - If you're in a draft, the name becomes a pill: "Project name ⛶ Draft 2 ⌄" [seen draft-switcher.png].
  - Then two icon buttons: History (clock with an arrow) and Hide chat (panel icon).
- **Center-left, above the preview:** the project toolbar tabs.
  - Early 2026: a "🌐 Preview" pill (active = light-blue tint with blue text and border), then icon-only square tabs: Cloud (☁), Code (</>), Analytics (chart), and "+".
  - The "+" opens a "pin tabs" menu [seen 2025-nov-26-design-view.png] listing Analytics, Cloud, Code, Design, Security, Speed. Each has a 📌 pin toggle to add it as a header tab.
  - Docs 2026 names the tabs **Preview, Files, Code, More**. "More" opens a panel with Analytics, Cloud, AI, Agent integrations, Payments, Connectors, Security, SEO & AI search, and Settings.
- **Center (URL bar),** a rounded pill about 300 to 360px:
  - device toggle icon (monitor/tablet/phone)
  - page selector "/" (click for the page list, a "Find page or enter path" input, and social/search preview cards on hover) [docs]
  - open in new tab ↗
  - refresh ↻ (Shift+click restarts the sandbox) [docs]
- **Right, left to right:** preview-toolbar toggle and Comments (only when the toolbar is hidden), collaborator avatars, "Share" (with avatar), a GitHub icon, and **"Publish"**.
  - Publish is a blue filled button, about 32px tall, white text. Business plans show it as "Publish to workspace".

**Device toggle:** Desktop / Tablet / Mobile [docs]. The mobile view renders a narrow centered frame.

**Panes that replace the preview area** (the chat stays visible):
- Plan view
- Details view (Timeline | Changes)
- Code
- Cloud
- Design/Visual edits
- Version snapshot
- Each has a top bar with "Close" at left and a centered title, e.g. "Plan" or "Details".

## A3. Chat panel (Lovable)

Sources:
- [seen] questions-chat.jpg (https://lovable.dev/blog/chat-mode-and-questions)
- [seen] GIFs above
- [seen] build-browser-testing.png
- [seen] view-credits-on-message.png (blog/agent-mode-beta)
- [seen] code-viewer-lovable.png (2025)
- [docs] https://docs.lovable.dev/features/projects/chat

**Day/time separators:** a centered muted timestamp at the start of a session, e.g. "Jan 28 at 11:55 AM".

**User message:** right-aligned bubble.
- Light theme: light gray (#efeeeb). Dark theme: #2a2a2a.
- Radius about 16px, padding about 10x14px, max width about 75%, 14px text.
- Hover → "Edit message" → confirm with **"Revert and resend"** (rewinds the project and reruns) [docs].
- An "Updated plan" label marks messages that carried a saved plan [docs].

**Assistant message:** no bubble or background; plain text on the panel background.
- In 2025 shots there's an optional header row "♥ Lovable" with ⋯ at the right. In 2026 shots there's no header.
- **Thinking row:** a lightbulb outline icon (some shots omit it) plus "Thought for 14s", muted gray 13 to 14px. It's collapsible.
  - While running, the label is a **shimmering "Thinking"** text (shimmer gradient sweeps across) [seen, plan-mode.gif].
- Markdown body (14 to 15px):
  - bold section headings with emoji (2025)
  - numbered and bulleted lists with **bold lead-ins**
  - inline code as a gray rounded chip
- **Tool rows (2025 style):** "<> **Edited** `src/components/Navbar.tsx`" — a code icon, the bold verb, then the filename in a gray mono chip. "✎ Generated image" plus a prompt chip [seen].
- **Activity card (2026 style)** [seen]: a rounded card (radius about 14px). Background is slightly lighter than the panel; the current/active card has a **blue 1.5px border**.
  - Header: verb plus a file chip, e.g. "Read [SortableTodoItem.tsx]", with a › chevron at the right.
  - Subtitle: an AI one-line summary ("ForwardRef clues guiding fixes in TodoItem").
  - Optional live browser screenshot thumbnail.
  - Divider, then a **task list** with three states:
    - ✓ check-circle = done
    - ◌ spinning ring = in progress (brighter text)
    - ○ empty circle = pending (muted)
  - While running: a single full-width "Details" button.
  - When finished: the change title (e.g. "Link authentication and profiles"), a 🔖 bookmark toggle at the top-right ("Bookmark in history"), and two buttons: "Details" (gray) and "Preview" (blue).
  - Clicking the card or Details opens the **Details view** in place of the preview [seen]:
    - Header: "Close", "Details", and a segmented "☰ Timeline | Changes".
    - Timeline: a vertical list of icon + step rows (Thought for 15s, Browser ready, 👁 Observed …, Click …, 📷 Took screenshot with the full screenshot, Read console logs, 📄 Read `CategoryBadge.tsx`) interleaved with prose.
- **Version card (2025):** a bookmark icon outside the card at left (yellow fill when saved), and a card with "<> **Add dark mode** ›" and "View code". Hover shows a floating pill: "↻ Restore | ↗ Preview" [seen versioning-bookmark.png].
- **Question card** (Lovable asks before building) [seen]:
  - Card with header strip "Questions".
  - Bold question.
  - Radio options, each with a bold title and a muted description. The selected row gets a lighter rounded fill.
  - A final radio with an "Other" text input.
  - Footer: "Back" (outlined), pagination dots in the middle (active dot = elongated pill), "Next". The last step's button is "Submit" (blue).
  - Up to 4 questions per card, each skippable [docs].
  - After submit it collapses to a summary: question line, then the chosen answer in bold.
- **Plan card** [seen plan-mode.gif]: "Plan" header with "Open" (outlined) and a blue "Approve ▾" split button, plus the plan summary text. Docs add "Skip".
- **Chat mode "Start building" card:** Lovable proposes switching to Build [docs].
- **Credit check-in / out of credits card:** "Add credits" / "Finish up" [docs].
- **Contextual action buttons** after a response [seen]:
  - "↳ ☁ View Backend"
  - In 2025: an outlined chip row "Visit docs", "Explore Supabase", "Manage knowledge".
- **Footer action row** under each finished response: small muted icons (16px) [seen]:
  - ↶ **Undo** (latest response only; no confirmation)
  - 👍, 👎
  - copy
  - ⋯ "More options" menu: Copy message link 🔗, Preview ↗, Restore ↻ (or "Revert to this version", which confirms), a divider, then "Worked for 35s" / "Credits used 1.80" (Chat mode: "Chat credits used [Free]").
  - The ⋯ menu works mid-run too, showing live "Working for" [docs].

**Streaming / working indicators:**
- shimmer "Thinking" label
- spinner rows in the task list
- the active activity card has a blue border
- the header subtitle reads "Loading Live Preview…"
- browser notifications when done [docs]

**Suggestions after a response:** chips above the composer, light rounded rectangles with a 1px border, 13px text, horizontally scrollable (e.g. "Test voice playback", "Add voice comparison", "Fix ref warnings"). Clicking one fills the composer; it doesn't send [seen + docs].

**Composer** (bottom of the chat column, a card about 110px tall, radius about 20px, white or #262626):
- Placeholder "Ask Lovable…".
- A **context row stack above the text** appears when a pane is open: "↩ Back to Preview", "📄 Plan" / "⑂ Details" (a selected row with gray fill) [seen].
- Selected preview elements, drawings and code refs (`Button.tsx:42`) attach as chips/pills [docs].
- Bottom row:
  - "+" (Chat actions: Project ▸ History/Knowledge/Design system/Settings/GitHub; Add context ▸ Skills/Projects/Connectors/Code/Figma/Take a screenshot/Attach files; Help center).
  - "⛶ Visual edits" (icon + label; it becomes a blue filled pill when on).
  - Right side:
    - mode text "Plan" (blue pill when active; picker Build/Chat/Plan, Alt+P cycles)
    - waveform voice button (Alt+V; record UI with ✓ / ✕)
    - send = black 28px circle with ↑
  - **While running:** send becomes **stop** (black circle with a white square). A second gray circle "+" appears for adding a follow-up [seen].
- `@` mentions open projects/connectors/files, and render as an inline tinted chip ("@ Creator's Oasis" in purple-pink) [seen 2026-feb-23-cross-project.png].
- `/` opens Skills; `/goal` is supported [docs].
- Drag-and-drop or paste files; the drag shows a file icon with a "3+" count badge over the composer [seen 2026-apr-1-code-exec.png].

**Queued / follow-up messages:**
- **2025 to early-2026 queue** [seen queuing.gif]: a panel above the composer.
  - Header "Queue [1]" (count badge), with ⏸ pause and a collapse ⤢ at the right.
  - Rows: ⠿ drag handle, text, copy icon, ✕.
- **2026 default** [docs]: follow-ups instead. A message sent while running appears **grayed-out at the bottom of the chat** until it's picked up.
  - Some messages are marked "Runs after the current task".
  - With the legacy queue on, rows also get "Send now".

## A4. Visual edits / preview toolbar (Lovable)

**2025 Visual Edits panel** [seen: selecting-text.png + color picker png, https://lovable.dev/blog/visual-edits; dark]
- Clicking the composer's "Edit" (crosshair, blue pill when on) turns the preview into select mode.
- The selected element gets a **1px dashed blue outline**.
- The panel docks **in the chat column above the composer**, as a card with radius 12px:
  - Header: a tag chip "TT h1", 🗑 delete, ✕.
  - Two-column rows (label left, about 120px):
    - Content (textarea)
    - Margin (two inputs: horizontal and vertical icons, both 0)
    - Padding (two inputs)
    - Font size (select "5XL")
    - Font weight (select "Medium")
    - Color (swatch + "Inherit")
    - Alignment (4 icon buttons)
  - Footer: "› Advanced", "Discard" (text), "Save" (blue).
  - **Color popover:** tabs "Styles | Custom". A Tailwind palette in named groups (Teal, Cyan, Sky…), 11 shades per group shown as 6+5 swatches (about 32px rounded squares). Hover shows a tooltip "Teal-400"; the current swatch has a white ring.
- The composer placeholder changes to "Ask Lovable to modify H1…".

**Nov 2025 Design view / Visual edits** [seen 2025-nov-18-visual-edits.png; 2025-nov-26-design-view.png]
- Header tab "🎨 Design" is active.
- The left panel becomes a **Design** pane:
  - Title "Design" with a sun/moon theme toggle.
  - Cards: "Themes — Browse and apply themes to your project ›" and "Visual edits — Select elements to edit and style visually ›".
  - Themes list: dark rows, each with 4 overlapping color dots and a name (Harvest, Lavender, Obsidian, Orchid, Solar, Tide, Verdant). Hover shows "Apply" plus "–".
- **Visual edits inspector:**
  - Breadcrumb "Design / Visual edits", with "⤒ Select parent", ↶, ↷ at the right.
  - Sections with bold headings and hairline dividers:
    - Text: Content
    - Spacing: Margin x/y, Padding x/y, each with an "expand to 4 sides" icon
    - Typography: Font size "Large", Font family "Sans-serif", Font weight "Medium", Alignment as a 4-segment control (active segment dark blue)
    - Color: Text color "● white", Background "● indigo-600"
    - Effects: Border radius "Large", Shadow "Small"
  - **Values are Tailwind tokens**, not raw px.
- In the preview, the selected element gets a **2px solid blue outline** and a small blue tag label ("Button") at its top-left.
- A **floating dark pill toolbar** sits under the element: inline "Ask Lovable…" input with a send circle | "</>" (jump to code) | 🗑.
- The composer shows the active chip "Visual edits" (blue).

**2026 preview toolbar** (replaces the Visual edits panel) [docs, https://docs.lovable.dev/features/preview-toolbar; not seen]
- A floating toolbar docked at the **bottom-center of the preview**. It's draggable, snaps to corners, can be minimized to an edge tab or hidden, and has an Auto/Light/Dark theme.
- Four modes with single-key shortcuts:
  - **S Select elements:** Cmd/Ctrl+click for multi-select. Each selection attaches to the composer as a chip.
  - **T Edit text inline:** contenteditable in place, then "Send" (100 free a day).
  - **D Draw annotation:** freehand plus auto-cleaned shapes (line, arrow, rectangle, circle, oval). It attaches an annotated screenshot to the composer.
  - **C Add a comment:** a pin plus a thread; teammates can reply. The button gets a red unread badge.
- While unsent work exists in one mode, the other modes are locked.

**Attachments viewer:** click an image to zoom/pan. "Draw" lets you sketch on it and "Save". Images in the conversation have an "Add to chat" action [docs].

## A5. Version history (Lovable)

**2025 Versioning 2.0** [seen versioning-2.jpeg, https://lovable.dev/blog/versioning-with-lovable-two-point-zero; dark]
- The left column has a segmented "Chat | History" control at the top.
- History list grouped by "Latest", "Saved" (bookmarked), "Today", "Yesterday", "Previously".
  - Item: a bookmark icon (outline, or yellow filled when saved), a title such as "Add feature" (15px), and a timestamp line such as "7:30am on 25/25/25" (13px, muted). Selected = gray rounded fill.
- **While previewing** an old version:
  - top bar center: "Previewing [Add feature]" chip
  - right: "Exit" (gray) and "**Restore this version**" (blue)
  - the same three controls are repeated at the bottom of the list
- The preview frame shows the URL "fractal.gptengineer.run / home ▾" and a segmented "Preview | Code".

**2026** [docs, https://docs.lovable.dev/features/projects/history]
- A **History toggle** (clock icon) in the header opens a panel with tabs **History | Bookmarks**.
- Clicking a version gives a read-only snapshot view; "Back to latest" sits in the top bar.
- Row actions:
  - ⋯ menu: Open preview in new tab, **View code changes** (diff), Go to message in chat
  - **Revert** (tooltip "Revert to this version"). It confirms, showing the date, with "Revert" or "View in chat".
  - Bookmark toggle
- The live version carries a "Published" badge.
- Very old versions are disabled with the tooltip "Cannot revert this far back in history".
- Reverting rolls back code only, not database data.

**Diff view (2025)** [seen code-viewer-lovable.png]
- Clicking "View code" on a version card swaps the preview for a diff pane.
- Top bar: "‹ Exit [ESC]", "View on GitHub [G]" (kbd hints), and at the right a "Raw | **Diff**" segmented control (Diff active = blue).
- File header with the path and a collapse control. Mono code with line numbers and a green bar on added lines.

## A6. Code view (Lovable)

[docs https://docs.lovable.dev/features/code-mode; 2025 Dev Mode image https://assets.lovable.dev/content/news/dev-mode.png]
- **Code** tab: a file tree on the left with "Expand all / Collapse all" and a "Search code" box (Cmd+Shift+F; results grouped Files / In files). Opened files appear as draggable tabs at the top. Right-click a file for "Open" / "Reference in chat".
- File toolbar: Preview markdown (eye), Copy, Download, Format, "Reference file in chat". Save / Discard (Cmd+S). Each save creates a version. The Free plan shows "Read only" plus "Upgrade".
- **Line references:** hover a line number and a "+" chip appears; drag it to select a range. Cmd+Shift+L adds a pill like `Button.tsx:42` to the composer.
- "Download codebase" (zip) sits at the bottom of the file panel.

## A7. Error states (Lovable)

All [docs]. I didn't find a screenshot of these.
- **Build error during a run:** a **"Try to fix"** button appears on the activity card. 10 free fixes a day. It's also offered in the Publish dialog, which blocks publishing while the build is broken.
- **Preview failures** show a centered message with "**Try again**" (restarts) and sometimes "Dismiss" (shows the last good version):
  - "Live preview couldn't start"
  - "Live preview lost connection"
  - "Live preview stopped responding"
- Third-party descriptions mention a red error overlay in the preview with a Try-to-fix button (rapidevelopers.com; unverified).
- **Idle pause:** the preview shows "**Still building?**" with a "**Keep building**" button.
- "Starting live preview…" is the boot state.
- **Drafts status glyphs** [seen draft-switcher.png]: ◌ working, ● gray = current, orange (?) = needs input, red ⚠ = error.

## A8. Empty / loading states (Lovable)

- **First generation** [seen plan-mode.gif, early 2026]:
  - The dashboard prompt animates into the editor.
  - Chat: centered timestamp, the user bubble, then a shimmering "Thinking".
  - Header subtitle: "Loading Live Preview…".
  - **Preview pane:**
    - a status chip at the top: "◷ Awaiting further instructions" (or the build status)
    - a centered **carousel of promo/feature cards**, e.g. an image card "Ecommerce included / Just ask to build a store. Shopify integration included."
    - vertical pager dots at the left, and ▲ / ⏸ / ▼ controls at the right
    - This fills the wait with something to look at instead of a skeleton.
- Design-direction picking before the first build [docs, https://docs.lovable.dev/features/design-guidance]:
  - **3 rendered HTML previews** side by side, with fullscreen and thumbnails.
  - Each has a "Describe changes" input plus 3 suggestion prompts; up to 6 refinements; then "Submit".
  - Or "design questions": font pairs, color palette swatches by mood, and layout wireframes (hero grid, bento, zigzag…).

## A9. What makes Lovable easy for non-technical users

- **One giant friendly prompt** on a warm gradient, with a personal greeting ("Ready to build, Ines?"). Voice input sits right there.
- **Asks before building:** question cards with plain-language options and descriptions, plus visual design directions. No "pick a framework".
- **Everything is reversible in one click:** Undo under the latest reply, Restore/Preview on every version, bookmark good states, and "Revert and resend" by editing your old message.
- **Point instead of describe:** select an element, edit text inline, draw on the preview, pin comments.
- **Errors are one button:** "Try to fix" (free), with no stack traces shown.
- **Live, narrated progress:** a task checklist inside the activity card, a browser screenshot thumbnail, and a plain-English one-line summary per step. A Details view is there for the curious.
- **Next-step chips** after every answer, so users never face a blank box.
- **Backend hidden behind "Cloud":** a database table with "Double click a value to edit in-line" [seen cloud-launch-assets.gif]. Left nav: Overview, Database, Storage, Users, Edge Functions, Secrets, Logs.
- **Publish is a big blue button**, and "publish my app" also works as a chat command.

---

# PART B: v0 (v0.app)

## B1. Home / dashboard

**Logged-out home** [seen, https://v0.app, Oct 2026; light]
- Background #fafafa; Geist font throughout.
- Top bar: the v0 logo at the left.
  - Center: Templates ▾, Enterprise, Pricing, iOS, Students, FAQ.
  - Right: "Log In" (white, bordered) and "Sign Up" (black).
- Announcement pill: "⊛ Use your **ChatGPT plan** in v0 ›" (white, bordered, rounded-full).
- H1 "What do you want to create?" (about 32px semibold, tracking tight). The dark-theme version is about 56px bold [seen askv3.mp4].
- **Prompt box:** about 690px wide by 106px. White with a 1px #e5e5e5 border, **radius about 12px**. It's squarer and flatter than Lovable's, with no shadow.
  - Placeholder "Ask v0 to build…".
  - Bottom row, left: model picker "◫ v0 Max ⌄" (small gray text with an icon).
    - Logged in: also "+" and a sliders icon (instructions) [seen].
    - The docs screenshot also shows a "Project ⌄" selector at the right.
  - Bottom row, right: a **black rounded-square 28px button** that is a **mic when empty and morphs to ↑ send** once you type [seen].
  - "+" menu: Import from GitHub, Create from Figma [green "Premium" badge], Upload from computer [seen v0 docs screenshot.png]. In 2026 this became a single "Import from ▸" with Figma / GitHub / Paper [docs changelog].
- **Suggestion chips** below the prompt: outlined rounded-full pills with icons ("✉ Contact Form", "Image Editor", "Mini Game", "Finance Calculator") and a circular ↻ "Refresh suggestions".
  - Dark logged-in variant: "📷 Clone a Screenshot", "Import from Figma", "Upload a Project", "Landing Page" [seen askv3.mp4].
- **"Start with a template"** section:
  - Header row: the title at the left; at the right, filter pills "Apps and Games", "Landing Pages", "Components", "Dashboards", then "Browse all ›".
  - Grid of 3 columns.
  - Card: a 16:9 screenshot (radius about 8px, 1px border), then below it an author avatar (32px circle), the title (15px medium), and a meta line "👥 6.7K • ♡ 740".

**Logged-in sidebar and pages** [seen folders-changelog.mp4, https://v0.app/changelog "Folders and Projects", Jan 2026; dark]
- Sidebar: a "**New Chat** ⌄" button at the top.
  - Nav: Search, Home, Library (later renamed **Chats**), Projects, Design Systems, Templates.
  - Then "Favorites ⌄", then recent chats.
  - Aug 2026 redesign [docs changelog]:
    - resizable width that persists
    - chats grouped by project and ordered by recency
    - right-click context menus
    - a favicon badge when a chat is ready or needs input
    - archive instead of delete
    - hover-card preview of how the last turn ended ("v0 is working")
    - lock icon on restricted chats
- **Library/Chats page:**
  - Header: H1 "Library" with "…" and "+ Folder" at the right.
  - Toolbar: "Search chats…" input plus "Filter".
  - Table with columns Name | Project | Updated ⌄. Rows have a thumbnail/folder icon, name, project, owner avatar, and "…".
- **Projects page:**
  - Header: H1 "Projects", "Search projects…", "⊞ New project".
  - 3-column cards: a 16:10 dark screenshot thumbnail (placeholder image icon when there is none), then a ▲ Vercel-style avatar, project name (14px), "23h ago", and "…".
  - From Sep 2026, cards show avatars of teammates active in the last 24h.
- **New Project modal:** three tiles ("⊕ Blank Project", "Import from GitHub", "Browse Templates"), then a "Jump back in" list (▲ name … "3m ago").
- **Import from GitHub modal:**
  - "Import from a URL" input plus "Import".
  - "Select a Repository": an owner dropdown, "Search repos", and a list (skeleton rows while loading).
  - Then "Create a New Project": Team / Project Name, Base Branch "⑂ main", Root Directory "./", and "Back" / "Create Project".

## B2. Project/chat editor layout

Sources: [seen] git-import.mp4, askv3.mp4, sandbox-startup.mp4 (docs, 2026), vercel.com/blog/introducing-the-new-v0 git_panel_desktop_light.png (Feb 2026), design-mode.mp4 (2025).

**Header** (about 48px, flush with the app background, no border):
- **Left:** a breadcrumb with thin "/" separators.
  - v0 logo / scope avatar (gradient circle, or "Personal") ⇅ / **Chat title** with a 🔒 visibility icon. Under it, small muted text: "**View Project**" (a link to the Vercel project).
  - The 2025 form was "Team ⇅ / Project ⇅ / Chat ⇅".
- **Center or right of center:** "▲ project-name / ⑂ branch-name [Beta] ⌄". This is the **branch menu**, also shown as a PR pill "⑂ #55".
- **Right:** "🎁 Refer" (2025 to 26), "Settings", "…" (project menu), GitHub icon, "Invite"/"Share", then **"Publish"**.
  - Publish is a solid white button in dark mode or black in light mode, with a 🌐 or merge icon.
  - A **blue dot badge** marks unpublished changes. It gets a spinner while publishing.
  - Then the user avatar. "Admin" badge for staff.

**Left icon rail** (Feb to mid 2026) [seen]: about 64 to 90px wide.
- Items are a vertical stack of a 20 to 24px icon over a 11 to 12px label: **Chat, Design, Git/GitHub, Connect, Vars, Rules, Settings**.
- The active item gets a rounded gray square behind the icon. Hover shows a tooltip with a shortcut ("Connect an Integration ⌥ 3", "Settings ⌥ 6").
- A feedback/mail icon sits at the bottom.
- Each item swaps the content of the **same left panel**:
  - Chat
  - Design (theme: fonts, color strip, radius slider, shadow tiles)
  - GitHub (key-value: Branch / Merges into / Status ✓ Up to date / PR #1234, plus an Activity timeline of commits)
  - Connect (Installed / All Integrations cards with "Install ⌄" split buttons)
  - Vars (KEY in mono, masked ••••• with an eye toggle, scope "All Environments", ⋯)
  - Rules (Instructions textarea plus Sources upload)
  - Settings (Vercel ● Connected / GitHub Connect cards)
- In later 2026 captures [seen sandbox-startup.mp4] the rail is gone. **Modes moved to the preview toolbar** as Preview / Design / Code / Database tabs with illustrated tooltips (Aug 2026 changelog), and settings moved to the header.

**Chat column:** about 20 to 25% of width (about 260 to 330px at 1280), and **resizable** (drag handles, Mar 2026 changelog). It's collapsible with "«" in the preview toolbar.

**Preview panel:** a big rounded card (radius about 10 to 12px, 1px border #222 dark / #eaeaea light).
- **Toolbar row:**
  - "«" collapse chat
  - a segmented icon group [👁 Preview | </> Code | ⛁ Database]. Active = filled with a subtle border. The 2025 version had text tabs "▭ Preview | </> Code | >_ Console".
  - centered **URL pill**: "‹ › 🖥 /path", with "↗" open-in-new-tab and "↻" at the right end. The 2026 light version has the pill right-aligned.
  - right: ">_" console toggle, a layout icon, "…"
  - 2025 extras: a download icon, an element-picker cursor (blue when on), duplicate, fullscreen ⛶
- A **Console bar** is docked at the bottom with a terminal icon (red dot = errors) and ⌃ to expand [seen design-element.png].
- The panel is drag-resizable.

## B3. Chat panel (v0): the part to copy most closely

Sources: [seen] askv3.mp4 crops, chatsidebar.mp4, commands.mp4, editor.mp4, design-mode.mp4, versions.png, workdetails.png, chat-database.png.

- **System lines** at the top of a chat: "✓ Cloned branch **main** of **owner/repo** to start this chat." in a dashed/outlined rounded box, or "New chat started from template [Shader component ↗]" (link in blue).
- **User message:** right-aligned, dark gray (#262626) or light gray (#f2f2f2) rounded bubble (radius about 12px), 14px text, max about 70%. A small avatar sits above it at the right; a copy icon appears under it on hover.
  - The answered-questions recap renders as a **dashed-border box** listing Q and the bold answer.
- **Assistant turn:** no avatar or bubble (2025: "v0 Assistant · Just now" header). A **vertical flow of short prose paragraphs interleaved with compact step rows.**
  - **Step row:** a 14px muted icon plus a past-tense label in 13px gray. Consecutive rows are joined by a thin vertical connector line. Examples:
    - "🧠 Thought for 3s" (brain icon; expandable, holds the reasoning text)
    - "🔍 Explored codebase", "🔍 Read layout file", "🔍 Read globals.css", "🔍 Found title element"
    - "⚇ Generated retro design"
    - "🔧 Reviewed work", "🔧 No issues found"
    - "🌐 Opening app in browser" (with an output block)
    - "Searched the web" with favicon citation pills [docs]
  - **Version card** (the commit for that turn): a rounded card (radius 8px, border #333), "› **Built Snake game**  v1" with "⋯" at the right.
    - The **current/selected version has a blue outline.**
    - Labels: "v2 (edited)" when you hand-edited code, with a sub-line "You made 4 edits · Undo".
    - Expanded (chevron): a vertical file timeline, each row a check-circle, a mono path ("app/dashboard/page.tsx"), and "Generated" at the right [seen versions.png]. The 2025 header was "⌄ Version 1 … Restore | View".
    - ⋯ menu: view, diff, restore, fork (the API has restore-message) [docs].
  - **Bash / tool approval card:**
    - Header "⌨ Bash" plus "Hide Details ≎".
    - "Run this command?" with the command in a mono inset box.
    - Footer: "Skip" (outlined) | "**Allow ▾**" (blue split button for always-allow rules).
    - Grouped approvals land in **one panel above the composer** (Jul 2026). Env-var requests appear above the composer like questions, with collapse and reopen.
  - **Terminal output block:** a black inset, mono 12px, "$ cmd", green ✓ lines, red ✗ lines, "Tests 7 passed | 1 failed (8)".
  - Markdown: bold labels ("Root Cause:", "Fix:"), inline code chips, and **diff code blocks** (path comment header, red "-" lines, green "+" lines).
  - Closing status: "✅ Fix applied. Re-running tests… all 8 tests pass now."
  - **Footer:**
    - "∿ **Worked for 3m 1s**", collapsible into "Work Details": Work Done "1 actions", Files modified, Items read "493 lines", Code changed "+2 -1", Credits used "0.075 credits", with mono values right-aligned [seen workdetails.png].
    - Then 👍 👎 ⧉ ⋯ and "🕘 9:43 AM".
    - ↻ retry with model selection [changelog].
- **Clarifying-question card** [seen askv3.mp4]:
  - A card with a **blue 2px border**.
  - Header "**1/3**  Features" (counter muted, title white).
  - Question text in gray, with "(select multiple)" when it allows that.
  - Radio or checkbox rows (16px), plus "Other" with an inline input.
  - Footer: two equal-width buttons, "Skip" | "Next" (Next disabled until answered; the last one is "Submit").
  - Done steps collapse to "✓ 1/3 Features".
  - **Jun 2026:** questions moved **into the prompt form** (above the input), with single/multi-select, skip, and inline custom answers.
- **Streaming:**
  - The stream shows text then step rows in real time.
  - The composer send turns into a "**⏹ Stop**" pill (white).
  - The stop button is visibly disabled before the first token.
  - The sidebar says "v0 is working".
  - The preview center shows a small code-window illustration (traffic lights plus the current filename "compon…trols.tsx") with the caption "**Building Snake game**", i.e. the live task title.
- **Composer:** a bottom card (radius about 12px, border).
  - Placeholder "Ask a follow-up…". Optional chip strip at the top: an element chip "◇ h3", attachment chips with image thumbnails (drag to reorder), skill chips, code-comment annotations (pencil to edit).
  - Bottom row:
    - "+" (attach, screenshot, import)
    - ⚙ sliders (instructions / Plan Mode presets: "Be Concise", "Plan Mode", "+ New Instruction")
    - model picker (icon ⌄; "Add models" with pricing, Thinking / Fast toggles)
    - "➤ **Design**" toggle (blue pill when on)
    - right: ✨ (enhance prompt, 2025), 📎, mic, send (outlined square; filled when ready)
  - Footer disclaimer: "v0 may make mistakes. Please use with discretion."
  - Keys:
    - ↑/↓ recalls prompt history
    - `/` slash-command skills
    - URLs get highlighted inline with their favicon
    - Cmd+Enter sends and interrupts
- **Queue** [docs + changelog]: up to 10 queued prompts in a "queued prompts panel" above the composer (starts expanded). Reorder, edit, delete; Cmd+↑/↓ steps through them. Send turns into "Queue" while a run is in progress.
- **Follow-up suggestions** [seen chat-database.png]: label "Suggestions" with ✕, then chips "[integration logos] Add Integration", "Add authentication backend ↗", "Create signup form ↗", and › to scroll.

## B4. Design mode / annotations (v0)

[seen https://v0.app/docs/design-mode images design-element.png, controls.png, design-mode.png, design-save.png; video design-mode.mp4; v0-keyboard-shortcuts.mp4]
- Open it via the Design tab (tooltip "Design Mode ⌥ D") or the composer's "Design" toggle.
- **Empty state:** a dashed box reading "↖ Select an element on the canvas to edit".
- **Hover:** the element gets a thin blue outline. **Selected:** a 1px blue rectangle plus a small **blue chip label above the top-left, "◇ h3 ⌄"** (a dropdown that walks to parents).
- **Keyboard** (Dec 2025): arrow keys or Tab / Shift+Tab move between siblings and children, Shift+Enter selects the parent, Enter edits text inline in the canvas, Cmd+click quick-selects, Cmd+I toggles inspect vs interact, Esc deselects.
- **Panel** (replaces the chat column; tabs "Chat | Design" in 2025):
  - Header: element chip "◇ TabsList" (blue tinted, mono for component names), "⋯" at the right (includes delete element).
  - Sections with bold labels and hairline dividers:
    - **Typography:** font family select (the list renders each font in its own face: Geist, Geist Mono, Inter…); weight "Semi Bold" plus size "2xl"; Line Height "1.75rem"; Letter Spacing "0em"; Alignment segmented (↶ reset, left, center, right, justify); Decoration segmented (italic, strike, underline, overline, ⊘)
    - **Color:** checker swatch "Default", or "■ black" → "green-800"
    - **Background**
    - **Layout:** Margin as "|▫| 0px" and "⊤ 0px" with ⛶ (split to 4 sides) and 🔒 (link); Padding the same
    - **Size:** ↔ 100%, ↕ auto, 🔒
    - **Border:** color, style, width
    - **Appearance:** Opacity "100 %", Radius
    - **Shadow**
  - A theme-level variant (2026 Design rail): Design System picker, Fonts, Colors strip, Radius slider "0.75", Shadows tile grid (Small/Medium/Large/None/Glow/Solid), and a blue pill "Select a component".
  - Bottom: the composer with an element chip and the placeholder "**Refine this element…**". v0 auto-attaches a screenshot of the element.
- **Pending changes:** a floating pill at the bottom-center of the preview: "⚠ Unsaved Changes" | "Reset" | "**Save**" (tooltip ⌘S). The docs call this "Apply"; it creates a new chat version.
- **Annotations mode** (Jun 2026) [docs changelog, not seen]: click elements in the preview to drop **numbered comments**, then send them to the agent as one batch.
- **Code comments** [docs code-editing]: click or drag line numbers, a "+" appears, you type a comment, and it attaches to the prompt with the path, lines and code snapshot. The same works on Diff tab lines.

## B5. Versions (v0)

- **Each generating turn creates "vN"** shown as that turn's version card. Restoring creates a new latest version, so history stays linear [docs https://v0.app/docs/versions].
- The Code tab has a version selector "v2 (edited) ⌄" / "Latest ⌄" [seen editor.mp4].
- A message's **Diff tab** has a summary header of file changes and clickable file stats [changelog].
- Git timeline in the GitHub panel: "Pulled changes from main • Just Now", "-o- 5adg6f3 • Just Now", "⑂ branch was created", "(avatar) shadcn created the chat" [seen blog].

## B6. Code view (v0)

[seen editor.mp4, https://v0.app/changelog "Markdown and SVG Preview"; docs https://v0.app/docs/code-editing]
- Code tab: a narrow **file list** (about 170px) with a **per-file change stat** at the right ("+62" in green, "+32 / -7" in green/red). The selected row is gray.
- Editor: a filename header with eye (rendered preview for .md/.svg), copy, and download. Line numbers, VS Code-style syntax theme matched to Geist.
- A VS Code web editor with an activity bar was added in 2026 [changelog]. Search icon above the tree (filenames and contents). The code viewer is read-only; you comment instead.

## B7. Error states (v0)

- **Dev server fails to boot or install:** a **compact error bar beneath the preview**. Clicking it opens the console log at the exact error. The preview keeps its navigation and Retry/Restart actions [changelog Aug 2026, not seen].
- **Console panel** [seen sandbox-startup.mp4]:
  - Tabs "Logs | ⌨ Terminal".
  - Right side: "Filter…" input, copy, 🗑, ✕ "Hide panel".
  - Rows: "15:13:37.390Z [SERVER] message" (timestamp mono gray, gray tag chip).
  - Empty: "No logs available to display".
- **Runtime error notice** in the preview and **"Fix with v0"** (with a "Free" badge, 10 a day) [docs / changelog, not seen].
- The deployment popover's contextual action switches between **Review Code / Fix Build / Fix CI / Fix Conflicts** [seen branch menu image; docs].
- The Next.js dev overlay is suppressed inside embedded previews; v0 shows its own notice instead [changelog].
- A dead or expired sandbox auto-recovers. A stopped preview has a "Restart" button [changelog].

## B8. Empty / loading states (v0)

- **Sandbox boot** [seen sandbox-startup.mp4]:
  - The preview is black with a centered animated v0 glyph, which morphs between a square-slash and a test-tube.
  - The **Console auto-opens on Logs, streaming the install and dev-server output** (pnpm progress, "▲ Next.js 16.2.4 (Turbopack)", "✓ Ready in 437ms").
  - When ready, the app fades in above.
- Mid-2026: the previous preview stays visible while the VM boots, with a **thin progress line and no status pills** [changelog].
- A "zebra loader animation" for preview loading [changelog].
- During the first generation: the code-window illustration with the task caption "Building Snake game" [seen].
- Returning to a chat shows a loading skeleton (later removed for visited chats) [changelog].

## B9. Publish / share (v0)

[seen publish-flow.mp4, unified-publish-git-actions image (Sep 2026), vercel blog publish_pr_desktop_light.png]
- **Publish popover** (about 450px, radius 12px, shadow):
  - "Production Deployment ⓘ" (or "Preview Deployment").
  - Thumbnail 120x80 (during a build it shows **scrolling build-log text**), domain with ⧉, "Updated 13h ago", and a status dot: ● Ready (green), ● Publishing / ● Merged, starting deployment / ● Building (amber).
  - Rows with icon and ›: Customize Domain, Visibility "Team Only", Inspect on Vercel, Analytics. Git-backed adds: "⑂ v0/branch +2 −2 ↗", "PR #55 Open ↗", "✓ CI Passed ›", "↻ Pull Changes ›", "v0 Review Code ›".
  - Footer: "Visit Site ↗" (outlined) and "**Publish Changes**" (black; spinner "Publishing" while running; "Merge PR" in green for the PR flow).
  - Footnote: "Publishing will merge pull request #2 into main." / "This branch has no new changes to publish."
- **First publish wizard:** create project → visibility (explicit choice required) → domain → Publish [docs].
- **Share** became a centered Invite dialog with "View only" and team edit defaults [changelog].

## B10. What makes v0's chat great

- **Dense but calm transcript:** prose interleaved with tiny past-tense step rows on a connector line. You see exactly what the agent read, did and checked, without big cards.
- **Every turn ends with a named version card** ("Built Snake game v1"): click it to view, diff or restore. Manual edits are tracked ("v2 (edited) · You made 4 edits · Undo").
- **Honest accounting:** "Worked for 3m 1s", expandable to files changed, lines read and credits.
- **Inline approvals:** Bash "Run this command? Skip / Allow ▾". Questions, env-var requests and approvals all appear in the composer area, so the user always knows where input is needed.
- **Real terminal output and diffs inline**, rendered nicely (green and red, mono).
- **The composer is a power tool:** model picker, instructions, Design toggle, element/code/attachment chips, prompt history, slash skills, a queue of 10.
- **Preview and Console are first-class:** live logs during boot and a click-through error bar.

---

# PART C: Prioritized checklist for a clone

P0 = must have to feel on par. P1 = strongly expected. P2 = polish. Tag = which product it comes from.

### P0
1. [Lovable] Dashboard: centered greeting plus one big rounded prompt box on a warm gradient. Placeholder typewriter, "+" attach menu, voice, round send ↑. Project grid sheet below with screenshot-thumbnail cards (name, "Published" badge, edited time, hover ⋯).
2. [both] Editor split: chat left (about 30%, resizable and collapsible in v0) and the preview as a rounded card on the right.
   - Header left: project name ⌄ with a status subtitle ("Loading Live Preview…").
   - Header center: Preview/Code tabs plus a URL pill (device toggle, route "/", ↗ open, ↻ refresh).
   - Header right: Share plus a prominent Publish.
3. [v0] Assistant message anatomy: no bubble. Prose interleaved with muted icon + past-tense step rows ("Thought for 3s", "Read layout.tsx", "Edited X", "No issues found") joined by a connector line; "Thought for Xs" expands to show the reasoning. User messages are right-aligned gray bubbles.
4. [v0+Lovable] A per-turn **version card** ("› Built Snake game  v1  ⋯") with a blue outline when current. Restore (confirm; creates a new version, keeps history linear), Preview, and View diff. [Lovable] "Undo" icon under the latest reply.
5. [both] Streaming states:
   - shimmering "Thinking…" label
   - live step rows
   - send → **Stop** (circle with a square)
   - follow-up while running: queue panel or grayed pending message
   - preview placeholder showing the current task ("Building …"), not a blank screen
6. [Lovable] Activity card with a **task checklist** (✓ done / ◌ spinner / ○ pending), a one-line summary, and "Details" / "Preview" buttons. A Details view (Timeline | Changes) replaces the preview.
7. [both] Errors:
   - a compact error bar or overlay under/over the preview with a **"Try to fix" / "Fix with v0"** button that sends the logs to the agent
   - preview failure screens with "Try again"
   - an idle "Still building? / Keep building" pause screen
8. [v0] Console panel docked at the bottom of the preview: Logs (timestamped, [SERVER] tag, Filter, clear, close). It auto-opens during sandbox boot and streams install/dev output.
9. [both] Composer: autosize textarea, "+" menu (attach files and images, screenshot), paste/drag-drop with chips and thumbnails, Enter to send, a mode toggle (Build / Plan / Chat), Stop while running.
10. [Lovable] After-response suggestion chips above the composer (fill, don't auto-send). Footer icons: 👍 👎 copy ⋯ (time worked, cost).

### P1
11. [both] Clarifying-question card:
    - "1/3 Title" counter, radio/checkbox options with descriptions, "Other" input
    - Skip / Back / Next → Submit, dots or a counter for progress
    - answered steps collapse to a recap
12. [Lovable] Plan mode: a plan card in chat ("Open", blue "Approve ▾", "Skip"). The Plan view replaces the preview with a document, "Edit", "Approve", and select text → "Comment" to revise one section.
13. [v0] Design mode / [Lovable] Visual edits:
    - hover outline; selected = blue outline plus a tag chip ("◇ h3 ⌄") with parent navigation
    - inspector panel: Content, Typography (family/size/weight/line-height/letter-spacing/align), Color, Background, Margin/Padding (x/y with expand to 4), Radius, Shadow, Opacity
    - Tailwind-token dropdowns and a named Tailwind color palette with a "Teal-400" tooltip
    - floating "Ask about this element" mini-input under the selection
    - pending "Unsaved Changes · Reset · Save" pill; Save creates a version
14. [Lovable] Version history panel: grouped by Latest / Bookmarked / Today / Yesterday / Previously. Rows: title plus timestamp plus a bookmark toggle. Snapshot preview mode with a top bar "Previewing [X] · Exit · Restore this version" (blue).
15. [v0] Code tab: file tree with per-file "+N −M" change stats, a read-only (or editable) highlighted viewer, md/svg preview toggle, copy, download, a version selector "v3 ⌄", and a Diff tab with red/green lines. Click a line number → "+" → attach a code reference to the prompt.
16. [v0] Tool approval card ("Run this command?" with the mono command, Skip / Allow ▾) and inline terminal output blocks.
17. [v0] "Worked for Xs" footer, expandable into work details (files modified, lines read, lines changed, model).
18. [Lovable] "Edit message → Revert and resend" on your own past messages.
19. [Lovable] Device toggle (desktop/tablet/mobile) and a route/page selector dropdown with path entry.
20. [v0] Publish popover: thumbnail, URL, status dot (Ready/Building), Visit Site, "Publish Changes" with an in-button spinner, and a blue dot on the Publish button when there are unpublished changes.

### P2
21. [Lovable] First-build loading carousel of tips/feature cards with a status chip ("Awaiting further instructions"), instead of an empty preview.
22. [Lovable] Design directions: 3 rendered style previews to pick from before building; theme presets list (color-dot rows with Apply).
23. [Lovable] Preview toolbar floating at the bottom-center: Select (S), Edit text (T), Draw (D, shape cleanup), Comment (C).
24. [v0] Annotations mode: numbered pins sent as one batch. [Lovable] Draw on an attached image before sending.
25. [both] Sidebar: workspace switcher, Search ⌘K command palette, Projects / Starred / Recents, a favicon/badge when a chat finishes or needs input, sidebar toggle `[` / ⌘B.
26. [v0] Env vars panel (KEY mono, masked value with eye, scope, ⋯, "+") and Rules/Knowledge textarea ("e.g. This project uses App Router, Next.js and Tailwind.").
27. [v0] Composer extras: ↑/↓ prompt history, `@` mention chips (files and projects, tinted inline), `/` skills, URL favicon highlighting.
28. [Lovable] Contextual action buttons after a reply (e.g. "↳ View Backend").
29. [both] Keyboard shortcuts with kbd hints in tooltips ("Design Mode ⌥D", "Exit ESC", "⌘S").
30. [Lovable] Cloud/DB browser: table view with Add Row, Column visibility, Refresh, and double-click to edit a cell.

### Visual tokens worth copying
- **Lovable:**
  - cream app background (#f7f5f0-ish light / #1c1c1c dark)
  - blue (#2563eb-ish) for primary actions: Publish, Approve, active mode pill, current-card border, selection
  - large radii (composer 20 to 28px, cards 12 to 16px)
  - the signature blue→pink→orange gradient only on the dashboard
- **v0:**
  - near-monochrome Geist UI (#fafafa / #000)
  - 1px hairline borders, radius 8 to 12px
  - primary button = black (light) / white (dark)
  - blue (#0070f3-ish) only for focus/selection/approval ("Allow", the selected version outline, the question card border)
  - green/red for diff stats and status dots
  - mono font for paths, versions, logs and stats
