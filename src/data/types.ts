export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Tapbacks are a VIA Chat-only feature. They are stored as message metadata
 * (in Chatwoot: message.content_attributes / additional_attributes) and are
 * NEVER sent over SMS — the customer on the other end won't see them.
 */
export type Tapback = 'heart' | 'thumbsup' | 'ha' | 'emphasis' | 'question';

export interface Attachment {
  kind: 'image';
  url: string;
  alt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  text: string;
  at: number; // epoch ms
  status?: MessageStatus;
  readAt?: number;
  attachment?: Attachment;
  agentId?: string;
  meta?: { tapbacks?: Tapback[] };
}

export interface Handoff {
  at: number;
  source: 'Ray (voice)';
  reason: string;
  summary: string;
  bullets: string[];
  durationSec: number;
}

export interface Conversation {
  id: string;
  phone: string; // E.164-ish display string
  name?: string;
  pinned: boolean;
  unread: number;
  status: 'open' | 'resolved';
  assigneeId: string | null;
  lastMessage?: Message;
  handoff?: Handoff;
}

export interface Job {
  id: string;
  appliance: string;
  brand: string;
  model: string;
  issue: string;
  date: string; // ISO date
  status: 'scheduled' | 'parts ordered' | 'in progress' | 'completed';
  warranty?: boolean;
}

export interface Customer {
  phone: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  zone: string;
  isNew: boolean;
  since?: string;
  nextAppointment?: { date: string; window: 'morning' | 'afternoon' };
  openJobs: Job[];
  pastJobs: Job[];
  /** Placeholder: source field for prior sealed-system work not yet identified. */
  sealedSystemHistory: string | null;
  urgency: string[];
}

export interface Slot {
  date: string; // ISO date
  window: 'morning' | 'afternoon';
  label: string; // "8–12" / "12–5"
  room: number; // 0 = full
}

export interface SavedReply {
  id: string;
  title: string;
  body: string;
  scope: 'personal' | 'team';
  agentId?: string;
}

export interface Agent {
  id: string;
  name: string;
  initials: string;
}

export interface Draft {
  text: string;
  source: 'ai-template';
}

export interface Booking {
  conversationId: string;
  date: string;
  window: 'morning' | 'afternoon';
  appliance: string;
  issue: string;
}

export type AdapterEvent =
  | { type: 'message'; message: Message }
  | { type: 'message-updated'; message: Message }
  | { type: 'typing'; conversationId: string; typing: boolean }
  | { type: 'conversation'; conversation: Conversation };
