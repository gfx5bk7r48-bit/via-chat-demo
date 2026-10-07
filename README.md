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
- `src/store.ts` is the one line that picks the adapter.

## Develop

```bash
npm install
npm run dev     # local dev server
npm test        # adapter unit tests (vitest)
npm run build   # static build in dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. The site is marked `noindex,nofollow` and `robots.txt` disallows all crawlers.
