/**
 * Reads a `text/event-stream` body to its end, handing each `data:` payload to `onEvent` in
 * order (2026-10-20, the Consulente's run; the assistant keeps its own copy inside
 * `useAssistantStreaming`). Module-level and loop-only, so a caller's `try` block holds no
 * conditional the React Compiler refuses.
 */
export async function forEachSseEvent<T>(body: ReadableStream<Uint8Array>, onEvent: (event: T) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const raw of events) {
      const event = parseSseEvent<T>(raw);
      if (event) onEvent(event);
    }
  }
}

export function parseSseEvent<T>(raw: string): T | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice('data:'.length).trim();
  if (!payload || payload === '[DONE]') return null;
  return JSON.parse(payload) as T;
}
