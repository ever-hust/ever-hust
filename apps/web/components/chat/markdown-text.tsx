"use client";

import { memo, useMemo } from "react";
import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

/**
 * Lightweight markdown renderer for chat messages.
 * Supports: bold, italic, code, inline code, links, lists, headers, line breaks,
 * and fenced code blocks with a copy button.
 * No external dependencies required.
 */
function MarkdownTextInner({ text }: { text: string }) {
  const rendered = useMemo(() => parseMarkdown(text), [text]);
  return <div className="prose-chat">{rendered}</div>;
}

export const MarkdownText = memo(MarkdownTextInner);

/** Copy button for code blocks */
function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => copy(text)}
      className="absolute right-2 top-2 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
      aria-label={copied ? "Copied!" : "Copy code"}
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}

// Simple tokenizer / renderer -----------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Token =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; href: string; label: string };

/** Only allow http(s) links — blocks javascript:, data:, vbscript:, etc. */
function isSafeHref(href: string): boolean {
  try {
    const url = new URL(href, "https://placeholder.invalid");
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseInline(line: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match bold, italic, inline code, and links
  const regex =
    /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+?)\]\(([^)]+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // Bold **text**
      nodes.push(
        <strong key={match.index} className="font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[4]) {
      // Italic *text*
      nodes.push(
        <em key={match.index} className="italic">
          {match[4]}
        </em>
      );
    } else if (match[6]) {
      // Inline code `code`
      nodes.push(
        <code
          key={match.index}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {match[6]}
        </code>
      );
    } else if (match[8] && match[9]) {
      // Link [label](href) — only render as clickable if safe protocol
      if (isSafeHref(match[9])) {
        nodes.push(
          <a
            key={match.index}
            href={match[9]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {match[8]}
          </a>
        );
      } else {
        // Unsafe protocol (javascript:, data:, etc.) — render as plain text
        nodes.push(<span key={match.index}>{match[8]}</span>);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listItems: React.ReactNode[] = [];
  let orderedItems: React.ReactNode[] = [];
  let codeBlock: string[] | null = null;
  let codeLanguage = "";

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${i}`} className="my-1.5 ml-4 list-disc space-y-0.5">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-sm">
              {item}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
    if (orderedItems.length > 0) {
      elements.push(
        <ol
          key={`ol-${i}`}
          className="my-1.5 ml-4 list-decimal space-y-0.5"
        >
          {orderedItems.map((item, idx) => (
            <li key={idx} className="text-sm">
              {item}
            </li>
          ))}
        </ol>
      );
      orderedItems = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // Code block fence
    if (line.startsWith("```")) {
      if (codeBlock === null) {
        // Start code block
        codeLanguage = line.slice(3).trim();
        codeBlock = [];
        i++;
        continue;
      } else {
        // End code block
        flushList();
        const codeContent = codeBlock.join("\n");
        const lang = codeLanguage;
        elements.push(
          <div key={`code-${i}`} className="group relative my-2">
            <pre className="overflow-x-auto rounded-md bg-muted/70 p-3 pr-10 text-xs leading-relaxed">
              {lang && (
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {lang}
                </div>
              )}
              <code className="font-mono">{codeContent}</code>
            </pre>
            <CopyButton text={codeContent} />
          </div>
        );
        codeBlock = null;
        codeLanguage = "";
        i++;
        continue;
      }
    }

    // Inside code block
    if (codeBlock !== null) {
      codeBlock.push(line);
      i++;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1]!.length;
      const content = parseInline(headerMatch[2]!);
      if (level === 1) {
        elements.push(
          <h3
            key={`h-${i}`}
            className="mt-3 mb-1.5 text-base font-bold first:mt-0"
          >
            {content}
          </h3>
        );
      } else if (level === 2) {
        elements.push(
          <h4
            key={`h-${i}`}
            className="mt-2.5 mb-1 text-sm font-bold first:mt-0"
          >
            {content}
          </h4>
        );
      } else {
        elements.push(
          <h5
            key={`h-${i}`}
            className="mt-2 mb-1 text-sm font-semibold first:mt-0"
          >
            {content}
          </h5>
        );
      }
      i++;
      continue;
    }

    // Unordered list item (- or *)
    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (orderedItems.length > 0) flushList();
      listItems.push(parseInline(ulMatch[1]!));
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listItems.length > 0) flushList();
      orderedItems.push(parseInline(olMatch[1]!));
      i++;
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      flushList();
      elements.push(
        <hr key={`hr-${i}`} className="my-2 border-muted-foreground/20" />
      );
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      i++;
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="my-0.5 text-sm leading-relaxed">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  // Flush any remaining lists
  flushList();

  // Close any unclosed code block
  if (codeBlock !== null && codeBlock.length > 0) {
    const finalCode = codeBlock.join("\n");
    elements.push(
      <div key="code-final" className="group relative my-2">
        <pre className="overflow-x-auto rounded-md bg-muted/70 p-3 pr-10 text-xs leading-relaxed">
          <code className="font-mono">{finalCode}</code>
        </pre>
        <CopyButton text={finalCode} />
      </div>
    );
  }

  return elements;
}
