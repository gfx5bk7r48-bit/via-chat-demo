/**
 * The single data seam for VIA Chat.
 *
 * Every component talks to a `DataAdapter`; nothing else knows where data
 * comes from. Today that is `MockAdapter` (in-memory, simulated customers).
 * Later it is `ChatwootAdapter` (Chatwoot REST + ActionCable), with customer
 * lookup / availability / booking / drafts served by our own backend.
 */
import type {
  AdapterEvent, Agent, Booking, Conversation, Customer, Draft, Message,
  SavedReply, Slot, Tapback,
} from './types';

export type Unsubscribe = () => void;

export interface DataAdapter {
  listAgents(): Promise<Agent[]>;
  listConversations(): Promise<Conversation[]>;
  getMessages(conversationId: string): Promise<Message[]>;
  sendMessage(conversationId: string, text: string, agentId: string): Promise<Message>;
  markRead(conversationId: string): Promise<void>;
  subscribe(listener: (e: AdapterEvent) => void): Unsubscribe;

  assign(conversationId: string, agentId: string | null): Promise<Conversation>;
  setStatus(conversationId: string, status: 'open' | 'resolved'): Promise<Conversation>;
  togglePin(conversationId: string): Promise<Conversation>;
  /** VIA-only metadata; never delivered to SMS customers. */
  setTapback(messageId: string, tapback: Tapback | null): Promise<Message>;

  getCustomer(phone: string): Promise<Customer | null>;
  getAvailability(zip: string): Promise<Slot[]>;
  bookAppointment(b: Booking): Promise<{ callsheetId: string }>;

  listSavedReplies(agentId: string): Promise<SavedReply[]>;
  createSavedReply(r: Omit<SavedReply, 'id'>): Promise<SavedReply>;
  updateSavedReply(r: SavedReply): Promise<SavedReply>;
  deleteSavedReply(id: string): Promise<void>;

  /** Suggest a reply. Must never send anything by itself. */
  draftReply(conversationId: string): Promise<Draft | null>;
}

/** Demo-only hooks used by the customer-phone simulator. */
export interface SimulatorHooks {
  simulateInbound(phone: string, text: string, attachment?: Message['attachment']): Promise<Message>;
  simulateTyping(phone: string, typing: boolean): void;
}
