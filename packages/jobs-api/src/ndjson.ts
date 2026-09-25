/**
 * Minimal, allocation-conscious NDJSON line reader.
 *
 * Reads a byte stream (a `fetch` response body or any async iterable of `Uint8Array`) and yields
 * one string per non-blank line:
 *
 * - UTF-8 is decoded in streaming mode, so a multi-byte character split across two chunks is
 *   reassembled correctly.
 * - A line may be split across any number of chunks; a chunk may carry many lines.
 * - `\r\n` and `\n` line endings are both accepted (the trailing `\r` is stripped).
 * - Blank / whitespace-only lines are skipped (heartbeat padding).
 * - A final line without a trailing newline is still yielded.
 * - A single line longer than `maxLineLength` characters aborts the read with
 *   {@link NdjsonLineTooLongError} instead of growing the buffer without bound.
 * - When the consumer stops early, the source is cancelled so the connection is released.
 *
 * Parsing the JSON is left to the caller so it can decide how to treat a malformed line.
 */

/** Default ceiling for a single line (characters). A job with a long description is ~50 KB. */
export const DEFAULT_MAX_NDJSON_LINE_LENGTH = 16 * 1024 * 1024;

const LF = "\n";
const CR = "\r";

export class NdjsonLineTooLongError extends Error {
  constructor(public readonly limit: number) {
    super(`NDJSON line exceeds ${limit} characters`);
    this.name = "NdjsonLineTooLongError";
  }
}

export type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

interface ChunkCursor {
  next(): Promise<IteratorResult<Uint8Array>>;
  /** Stop reading early and release the connection. */
  cancel(): Promise<void>;
  release(): void;
}

/** A pull cursor over a web `ReadableStream` or any async iterable of byte chunks. */
function cursorOf(source: ByteSource): ChunkCursor {
  if (typeof (source as ReadableStream<Uint8Array>).getReader === "function") {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    return {
      next: () => reader.read() as Promise<IteratorResult<Uint8Array>>,
      cancel: () => reader.cancel().catch(() => undefined),
      release: () => reader.releaseLock(),
    };
  }
  const iterator = (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
  return {
    next: () => iterator.next(),
    cancel: async () => {
      await iterator.return?.().catch(() => undefined);
    },
    release: () => undefined,
  };
}

/** Strip a trailing CR; `undefined` for a blank / whitespace-only line. */
function normaliseLine(text: string): string | undefined {
  const line = text.endsWith(CR) ? text.slice(0, -1) : text;
  return line.trim().length > 0 ? line : undefined;
}

export async function* readNdjsonLines(
  source: ByteSource,
  options?: { maxLineLength?: number },
): AsyncGenerator<string> {
  const maxLineLength = options?.maxLineLength ?? DEFAULT_MAX_NDJSON_LINE_LENGTH;
  const decoder = new TextDecoder("utf-8");
  const cursor = cursorOf(source);
  let buffer = "";
  let exhausted = false;

  // One generator with one try/finally: when the consumer stops early (break / return / throw),
  // the finally cancels the source so the socket is released.
  try {
    while (true) {
      const { done, value } = await cursor.next();
      if (done) {
        exhausted = true;
        break;
      }
      if (!value) continue;
      buffer += decoder.decode(value, { stream: true });
      let start = 0;
      let newline = buffer.indexOf(LF, start);
      while (newline !== -1) {
        const line = normaliseLine(buffer.slice(start, newline));
        if (line !== undefined) yield line;
        start = newline + 1;
        newline = buffer.indexOf(LF, start);
      }
      if (start > 0) buffer = buffer.slice(start);
      if (buffer.length > maxLineLength) throw new NdjsonLineTooLongError(maxLineLength);
    }

    buffer += decoder.decode();
    if (buffer.length > maxLineLength) throw new NdjsonLineTooLongError(maxLineLength);
    const last = normaliseLine(buffer);
    if (last !== undefined) yield last;
  } finally {
    if (!exhausted) await cursor.cancel();
    cursor.release();
  }
}

/** Parse one NDJSON line into a plain object, or `undefined` when it is not a JSON object. */
export function parseNdjsonObject(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
