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
- Per-agent saved replies (type `/` or use the ⚡ button), kept separate from team replies and persisted in `localStorage`
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
- `src/data/chatwootAdapter.ts` is a **stub** for a future Chatwoot backend. Each method has a TODO naming the Chatwoot Application API endpoint it maps to (conversations, messages, contacts, canned responses, assignments, toggle_status, update_last_seen) and the ActionCable `RoomChannel` events for live updates.
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
- Customer panel: ServiceDesk appointments, urgency strip and routing, read from a same-origin `/api/sd/*` proxy once it exists; until then it shows clearly labelled demo data. Morning/afternoon are routing buckets, so customer-facing text never quotes an 8–12 / 12–4 window.

## Develop

```bash
npm install
npm run dev     # local dev server
npm test        # adapter unit tests (vitest)
npm run build   # static build in dist/
```

Deployment: GitHub Pages serves the built `dist/` from the `gh-pages` branch. A GitHub Actions workflow (build, test, deploy to Pages) is prepared to replace that once a token with `workflow` scope can push it. The site is marked `noindex,nofollow` and `robots.txt` disallows all crawlers.
