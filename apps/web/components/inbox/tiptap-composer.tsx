"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { cn } from "@ever-hust/ui/lib/utils";

interface TipTapComposerProps {
  /** Current HTML value (controlled enough to reset between messages). */
  value: string;
  onChange: (html: string, text: string) => void;
  placeholder?: string;
}

/** Rich-text email composer (TipTap). Emits both HTML and a plain-text fallback. */
export function TipTapComposer({ value, onChange, placeholder }: TipTapComposerProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "",
    immediatelyRender: false, // SSR-safe in Next App Router
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[200px] rounded-md border bg-background p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "aria-label": placeholder ?? "Message body",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()),
  });

  // Reset content when the parent clears it (e.g. after send or switching threads).
  useEffect(() => {
    if (editor && value === "" && editor.getText() !== "") {
      editor.commands.clearContent();
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="min-h-[232px] rounded-md border bg-muted/20" aria-hidden="true" />;
  }

  const btn = (active: boolean) =>
    cn(
      "rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground",
      active && "bg-accent text-foreground",
    );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-1">
        <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">
          <Bold className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">
          <Italic className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bulleted list">
          <List className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list">
          <ListOrdered className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
