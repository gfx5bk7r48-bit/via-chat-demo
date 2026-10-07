# VIA Chat — UI demo

A clickable front-end demo of **VIA Chat**, an iMessage-style team texting dashboard for an appliance repair dispatch desk.

**Everything here is fake.** No backend, no SMS provider, no real customer data. All names, addresses and `555-01xx` numbers are fictional.

Live demo: https://gfx5bk7r48-bit.github.io/via-chat-demo/

## What's in it

- iMessage-style three-column layout (conversation list · thread · customer panel), dark mode (system or toggle), mobile slide-over navigation
- Bubble tails and grouping, timestamp dividers, Delivered / Read receipts, typing indicator, MMS photo bubbles (locally generated SVGs)
- Tapbacks (right-click or long-press) stored as VIA-only metadata. SMS customers never see them
- Customer panel: address and zone, new vs. repeat customer, next appointment window, open and past jobs, urgency chips, and a placeholder for prior sealed-system work
- Quick actions: Send ETA, Check availability by ZIP, Book appointment (mock callsheet toast)
- Per-agent saved replies (type `/` or use the ⚡ Preset Messages button), kept separate from team replies and persisted in `localStorage`
- AI suggested reply chip (template-based in the demo) with Use / Edit / Dismiss. It never sends on its own
- Voice-agent ("Ray") handoff banner with a call summary card
- Agent switcher, Assign to me, Resolve / Reopen, Pin
- **Customer phone simulator**: the floating button opens an iPhone mock. Text as any customer (or a new number), send a photo, and watch it arrive live in the dashboard

Shortcuts: `⌘/Ctrl+K` search · `Enter` send · `Shift+Enter` newline · `/` saved replies · `⌘/Ctrl+I` customer panel.

## The adapter seam

All UI code talks to one interface, `DataAdapter`, in [`src/data/adapter.ts`](src/data/adapter.ts):

```
listConversations · getMessages · sendMessage · markRead · subscribe(events)
assign · setStatus · togglePin · setTapback
getCustomer(phone) · getAvailability(zip) · bookAppointment
listSavedReplies · createSavedReply · updateSavedReply · deleteSavedReply
draftReply
```

- `src/data/mockAdapter.ts` is the in-memory store used by this demo. It simulates delivery and read receipts, typing, and inbound texts.
- `src/data/chatwootAdapter.ts` is the real-backend adapter (see below).
- `src/store.ts` picks the adapter at build time (`VITE_BACKEND`).

## Real backend build (self-hosted Chatwoot)

The same UI can run against a self-hosted **Chatwoot Community Edition** instead of the mock:

```bash
VITE_BASE=/via/ VITE_BACKEND=chatwoot npm run build
```

- Serve that build from the **same origin** as Chatwoot (e.g. `https://<chatwoot-host>/via/`). The public GitHub Pages demo stays on the mock adapter.
- Each agent signs in with their own Chatwoot email and password (`POST /auth/sign_in`). Only the short-lived session headers are kept, in `sessionStorage`; sign-out revokes them. **No API token is ever compiled into the bundle.**
- Conversations, messages, sending, private team notes, assignment, resolve/reopen, pin (a `pinned` label), tapbacks (conversation custom attributes, never sent over SMS), team saved replies (Chatwoot canned responses) and per-agent saved replies (stored in the agent's Chatwoot profile settings).
- Live updates over Chatwoot's ActionCable websocket (`/cable`, `RoomChannel`), with polling every 4 s as a fallback.
- The customer-phone simulator posts messages into the API inbox **as the contact**, the same way the SMS channel will, and marks agent texts read.
- Customer panel: ServiceDesk appointments (with street and problem), urgency strip and routing, read live from a same-origin server-side `/api/sd/*` proxy that checks the agent's Chatwoot session (phone lookups are POST only, never in a URL). Numbers on file under several names list every name. The seeded fake customers (555-01xx numbers) keep clearly labelled DEMO fixtures. "Book (demo)" only adds a private note. Morning/afternoon are routing buckets, so customer-facing text never quotes an 8–12 / 12–4 window.

## Manager dashboard (`/via/manage`, Chatwoot build only)

A lazy-loaded analytics view for VIA managers (`src/manage/`). Same look as the inbox, light and dark.

- **Access:** the inbox shows a *Manager Dashboard* icon only when `GET /api/analytics/whoami` returns 200. The real check is server-side in the private analytics service: the signed-in Chatwoot user must be an **administrator** of the account (or on the service's manager email allowlist). Agents get **403** from every `/api/analytics/*` endpoint and a "Managers only" page if they open the URL.
- **Filters:** Today / 7 / 30 / 90 days / custom range, agent, inbox, label. Every number is compared with the prior period of equal length. All times are Eastern.
- **Business hours vs. wall clock** switch for response-time metrics (default Mon–Sat 8am–5pm ET, editable in Settings with holidays).
- Sections: KPI tiles, volume over time, hour × weekday heatmap, new vs. returning customers, responsiveness (FRT median/p90, reply time, time to resolve), agent leaderboard, outcomes and labels, bookings proxy, AI suggestions and quick actions, Ray handoffs, messaging charges (messages × $0.025, rate set by LockStep), a LockStep-internal cost/margin card that the server only sends to LockStep users, live view (presence, open by agent, waiting, unassigned).
- **CSV export** on every table/chart card (UTF-8 with BOM for Excel; cells that look like formulas are escaped).
- Charts are plain SVG (no chart library).

## Usage events

`src/data/events.ts` batches small UI events to `POST /api/via-events` (any signed-in agent; Chatwoot build only): AI suggestion shown / used / edited / dismissed / sent, and the Send ETA, Offer a day and Book quick actions. Events carry only the type, conversation number and a few whitelisted fields (e.g. ETA minutes). Never message text, names or phone numbers. They are stored by the analytics service in its own database, not in Chatwoot.

## Tooltips

Every icon-only button has a small Apple-style tooltip (`src/components/Tooltip.tsx`): `tip(label, hint?)` sets `aria-label`, `title` and `data-tip`; one global `<TooltipLayer/>` shows the bubble after ~400 ms on hover, or right away on keyboard focus. Touch and pen never show it, so nothing sticks on iPad. While the custom bubble is up the native `title` is parked, so you never see two.

## Branding

The VIA Appliance logo is self-hosted in `public/assets/` (`via-logo.png` original, `via-logo-trim.png` cropped). The sidebar reads *[logo] Chat*. The logo also appears on the sign-in card, the empty thread and the dashboard header. In dark mode it sits on a light plate so the black outline stays legible. `favicon.ico`, `favicon-32.png` and `apple-touch-icon.png` show the cropped VIA mark on white. The brand accent (`--accent-2`) is the stripe red `#D32228`. Sent bubbles stay iMessage blue.

## Develop

```bash
npm install
npm run dev     # local dev server
npm test        # adapter unit tests (vitest)
npm run build   # static build in dist/
```

Deployment: GitHub Pages serves the built `dist/` from the `gh-pages` branch. A GitHub Actions workflow (build, test, deploy to Pages) is prepared to replace that once a token with `workflow` scope can push it. The site is marked `noindex,nofollow` and `robots.txt` disallows all crawlers.
