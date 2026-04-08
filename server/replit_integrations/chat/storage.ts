import { supabaseAdmin } from "../../supabase";
import { toCamelObj, toCamelArray } from "../../storage";

export interface IChatStorage {
  getConversation(id: number): Promise<any | undefined>;
  getAllConversations(): Promise<any[]>;
  createConversation(title: string): Promise<any>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<any>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const { data } = await supabaseAdmin.from("conversations").select("*").eq("id", id).limit(1).single();
    return data ? toCamelObj(data) : undefined;
  },

  async getAllConversations() {
    const { data } = await supabaseAdmin.from("conversations").select("*").order("created_at", { ascending: false });
    return toCamelArray(data || []);
  },

  async createConversation(title: string) {
    const { data } = await supabaseAdmin.from("conversations").insert({ title }).select().single();
    return toCamelObj(data);
  },

  async deleteConversation(id: number) {
    await supabaseAdmin.from("messages").delete().eq("conversation_id", id);
    await supabaseAdmin.from("conversations").delete().eq("id", id);
  },

  async getMessagesByConversation(conversationId: number) {
    const { data } = await supabaseAdmin.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    return toCamelArray(data || []);
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const { data } = await supabaseAdmin.from("messages").insert({ conversation_id: conversationId, role, content }).select().single();
    return toCamelObj(data);
  },
};
