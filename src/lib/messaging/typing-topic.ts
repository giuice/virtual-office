// Private Realtime topic carrying a conversation's typing signals (Phase 5
// FR-019, BR-009). Join and broadcast send on it are authorized in the
// database only for current members of the conversation (realtime.messages
// policies phase5_conversation_typing_*, migration
// 20261007224737_conversation_typing_private_topic.sql). The database accepts
// only the canonical lowercase UUID form, so the id is normalized here.
// Clients must join it with `config: { private: true }`; the same name on a
// public channel is a different topic that members never hear.
export function conversationTypingTopic(conversationId: string): string {
  return `conversation:${conversationId.toLowerCase()}:typing`;
}
