/**
 * ChatwootAdapter — STUB. Not used by the demo.
 *
 * Chatwoot (self-hosted, Community edition) is the planned headless backend.
 * Each method below lists the Chatwoot endpoint it maps to. Paths were checked
 * against the Application API spec at https://developers.chatwoot.com
 * (swagger: chatwoot/chatwoot swagger/tag_groups/application_swagger.json).
 *
 * Auth: header `api_access_token: <token>`. Do NOT ship an agent token in a
 * static bundle — requests should go through a server-side proxy that holds
 * secrets and authenticates the signed-in agent.
 *
 * Live updates: ActionCable at `wss://<host>/cable`, subscribe with
 *   {"command":"subscribe","identifier":"{\"channel\":\"RoomChannel\",\"pubsub_token\":\"<token>\",\"account_id\":<id>,\"user_id\":<id>}"}
 * where pubsub_token comes from GET /api/v1/profile. Events of interest:
 *   message.created, message.updated, conversation.created, conversation.updated,
 *   conversation.status_changed, conversation.read, assignee.changed,
 *   conversation.typing_on, conversation.typing_off.
 *
 * Customer lookup, availability, booking and AI drafts are NOT Chatwoot
 * features; they go to our own backend endpoints (placeholders below).
 */
import type { DataAdapter, Unsubscribe } from './adapter';
import type {
  AdapterEvent, Agent, Booking, Conversation, Customer, Draft, Message, SavedReply, Slot, Tapback,
} from './types';

export interface ChatwootConfig {
  baseUrl: string; // e.g. https://chat.example.com (or a same-origin proxy)
  accountId: number;
  /** Our own backend for non-Chatwoot features. */
  apiBase: string;
}

const todo = (what: string): never => { throw new Error(`ChatwootAdapter not implemented: ${what}`); };

export class ChatwootAdapter implements DataAdapter {
  constructor(private cfg: ChatwootConfig) {}
  private acct(path: string) { return `${this.cfg.baseUrl}/api/v1/accounts/${this.cfg.accountId}${path}`; }

  async listAgents(): Promise<Agent[]> {
    // TODO GET /api/v1/accounts/{account_id}/agents
    return todo(this.acct('/agents'));
  }
  async listConversations(): Promise<Conversation[]> {
    // TODO GET /api/v1/accounts/{account_id}/conversations?status=open|resolved|all&assignee_type=all&page=N
    //   (counts: GET /conversations/meta; advanced: POST /conversations/filter)
    //   Map: meta.sender.phone_number -> phone, unread_count -> unread,
    //   meta.assignee.id -> assigneeId, last_non_activity_message -> lastMessage.
    //   Pinning has no Chatwoot equivalent: use a conversation label (e.g. "pinned") or per-agent storage.
    return todo(this.acct('/conversations'));
  }
  async getMessages(conversationId: string): Promise<Message[]> {
    // TODO GET /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages?before=<id>
    //   message_type 0=incoming 1=outgoing 2=activity 3=template; status sent|delivered|read|failed.
    //   attachments[].data_url -> attachment.url. Skip private notes (private: true) or render separately.
    return todo(this.acct(`/conversations/${conversationId}/messages`));
  }
  async sendMessage(conversationId: string, text: string, _agentId: string): Promise<Message> {
    // TODO POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages
    //   body { content, message_type: "outgoing", private: false }  (multipart + attachments[] for MMS)
    //   Delivery/read receipts arrive later as message.updated over ActionCable (SMS provider status callbacks).
    void text;
    return todo(this.acct(`/conversations/${conversationId}/messages`));
  }
  async markRead(conversationId: string): Promise<void> {
    // TODO POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/update_last_seen
    return todo(this.acct(`/conversations/${conversationId}/update_last_seen`));
  }
  subscribe(_listener: (e: AdapterEvent) => void): Unsubscribe {
    // TODO open WebSocket to `${baseUrl.replace(/^http/, 'ws')}/cable`, subscribe to RoomChannel
    //   with pubsub_token (GET /api/v1/profile), translate events:
    //   message.created -> {type:'message'}, message.updated -> {type:'message-updated'},
    //   conversation.typing_on/off -> {type:'typing'}, conversation.* / assignee.changed -> {type:'conversation'}.
    //   Reconnect with backoff; refetch conversations after reconnect.
    return todo('ActionCable /cable RoomChannel');
  }
  async assign(conversationId: string, agentId: string | null): Promise<Conversation> {
    // TODO POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/assignments  body { assignee_id }
    void agentId;
    return todo(this.acct(`/conversations/${conversationId}/assignments`));
  }
  async setStatus(conversationId: string, status: 'open' | 'resolved'): Promise<Conversation> {
    // TODO POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/toggle_status  body { status }
    void status;
    return todo(this.acct(`/conversations/${conversationId}/toggle_status`));
  }
  async togglePin(conversationId: string): Promise<Conversation> {
    // TODO POST /api/v1/accounts/{account_id}/conversations/{conversation_id}/labels  body { labels: [...,"pinned"] }
    return todo(this.acct(`/conversations/${conversationId}/labels`));
  }
  async setTapback(messageId: string, tapback: Tapback | null): Promise<Message> {
    // TODO VIA-only metadata — never sent over SMS. Store in our backend keyed by Chatwoot message id,
    //   or verify whether PATCH /api/v1/accounts/{account_id}/conversations/{cid}/messages/{message_id}
    //   accepts content_attributes on the pinned Chatwoot version.
    void tapback;
    return todo(`tapback ${messageId}`);
  }
  async getCustomer(phone: string): Promise<Customer | null> {
    // Chatwoot contact: GET /api/v1/accounts/{account_id}/contacts/search?q=<phone>
    //   (GET /contacts/{id}, GET /contacts/{id}/conversations for history)
    // Jobs/appointments/zone: TODO GET `${apiBase}/customer?phone=` (our backend, not Chatwoot)
    return todo(`${this.acct('/contacts/search')}?q=${encodeURIComponent(phone)} + ${this.cfg.apiBase}/customer`);
  }
  async getAvailability(zip: string): Promise<Slot[]> {
    // TODO GET `${apiBase}/availability?zip=` (our backend)
    return todo(`${this.cfg.apiBase}/availability?zip=${zip}`);
  }
  async bookAppointment(b: Booking): Promise<{ callsheetId: string }> {
    // TODO POST `${apiBase}/callsheet` (our backend); optionally add a private note to the
    //   conversation via POST .../messages { private: true }.
    void b;
    return todo(`${this.cfg.apiBase}/callsheet`);
  }
  async listSavedReplies(agentId: string): Promise<SavedReply[]> {
    // Team-shared: GET /api/v1/accounts/{account_id}/canned_responses  (short_code -> title, content -> body)
    //   Chatwoot canned responses are account-wide, so PERSONAL replies need our backend:
    //   TODO GET `${apiBase}/agents/{agentId}/replies`
    void agentId;
    return todo(this.acct('/canned_responses'));
  }
  async createSavedReply(r: Omit<SavedReply, 'id'>): Promise<SavedReply> {
    // team: POST /api/v1/accounts/{account_id}/canned_responses { short_code, content }
    // personal: TODO POST `${apiBase}/agents/{agentId}/replies`
    void r;
    return todo(this.acct('/canned_responses'));
  }
  async updateSavedReply(r: SavedReply): Promise<SavedReply> {
    // team: PATCH /api/v1/accounts/{account_id}/canned_responses/{id}; personal: our backend
    return todo(this.acct(`/canned_responses/${r.id}`));
  }
  async deleteSavedReply(id: string): Promise<void> {
    // team: DELETE /api/v1/accounts/{account_id}/canned_responses/{id}; personal: our backend
    return todo(this.acct(`/canned_responses/${id}`));
  }
  async draftReply(conversationId: string): Promise<Draft | null> {
    // TODO POST `${apiBase}/draft` { conversationId } — server builds the prompt from recent
    //   messages + customer context. Never auto-sends; log generated/used/edited/dismissed.
    return todo(`${this.cfg.apiBase}/draft ${conversationId}`);
  }
}
