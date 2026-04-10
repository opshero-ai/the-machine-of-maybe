const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Fact {
  fact: string;
  category: string;
  explanation: string;
  source_hint: string;
  follow_up_question: string;
  mind_blown_rating: number;
  related_facts: string[];
  date: string;
  generated_at?: string;
}

export interface ChatChunk {
  type: "meta" | "text";
  content?: string;
  conversation_id?: string;
}

export async function getTodaysFact(): Promise<{ fact: Fact | null; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/fact/today`, { cache: "no-store" });
    if (!res.ok) {
      return { fact: null, error: `Failed to load fact (${res.status})` };
    }
    const data = await res.json();
    return { fact: data.fact };
  } catch (e) {
    return { fact: null, error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function getFactArchive(limit = 30): Promise<{ facts: Fact[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/facts/archive?limit=${limit}`, { cache: "no-store" });
    if (!res.ok) return { facts: [], error: `Failed to load archive (${res.status})` };
    const data = await res.json();
    return { facts: data.facts ?? [] };
  } catch (e) {
    return { facts: [], error: e instanceof Error ? e.message : "Network error" };
  }
}

export async function* streamChat(
  message: string,
  conversationId: string | null
): AsyncGenerator<ChatChunk> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const chunk = JSON.parse(line.slice(6));
          yield chunk as ChatChunk;
        } catch {
          // skip malformed
        }
      }
    }
  }
}
