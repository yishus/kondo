import type { ChatToolCall } from "./chat-stream";
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
export const MAX_CHAT_MESSAGES = 40;

export type ChatCitation = { url: string; title: string; start: number; end: number };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: ChatCitation[];
  toolCalls?: ChatToolCall[];
  createdAt: string;
};
export type CardChatData = {
  messages?: ChatMessage[];
  available?: boolean;
  error?: string;
  completed?: string;
};

export function safeChatUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

/** Replace API citation markers with Markdown links, preserving the surrounding answer. */
export function citedMarkdown(message: ChatMessage) {
  let cursor = 0;
  let result = "";
  const citations = [...message.citations].sort((a, b) => a.start - b.start || a.end - b.end);
  citations.forEach((citation, index) => {
    const url = safeChatUrl(citation.url);
    if (!url || citation.start < cursor || citation.end > message.text.length || citation.end < citation.start) return;
    result += message.text.slice(cursor, citation.start);
    result += ` [\\[${index + 1}\\]](<${url.replace(/</g, "%3C").replace(/>/g, "%3E")}>)`;
    cursor = citation.end;
  });
  return result + message.text.slice(cursor);
}
