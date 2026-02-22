"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Minus,
  ImageIcon,
  Undo2,
  Redo2,
  Quote,
  CodeSquare,
} from "lucide-react";
import { cn } from "./lib/utils";

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------

interface ToolbarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tooltip?: string;
}

function ToolbarButton({
  active,
  tooltip,
  className,
  children,
  ...props
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        active && "bg-accent text-accent-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toolbar separator
// ---------------------------------------------------------------------------

function ToolbarSeparator() {
  return (
    <div
      role="separator"
      className="mx-1 h-6 w-px shrink-0 bg-border"
    />
  );
}

// ---------------------------------------------------------------------------
// Editor toolbar
// ---------------------------------------------------------------------------

interface EditorToolbarProps {
  editor: Editor;
}

function EditorToolbar({ editor }: EditorToolbarProps) {
  const iconSize = 16;

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/40 px-2 py-1.5"
    >
      {/* Text formatting */}
      <ToolbarButton
        tooltip="Bold (Ctrl+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
      >
        <Bold size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Italic (Ctrl+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
      >
        <Italic size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Underline (Ctrl+U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
      >
        <Underline size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Strikethrough (Ctrl+Shift+S)"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Inline code (Ctrl+E)"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={!editor.can().chain().focus().toggleCode().run()}
      >
        <Code size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Subscript"
        active={editor.isActive("subscript")}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        disabled={!editor.can().chain().focus().toggleSubscript().run()}
      >
        <SubscriptIcon size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Superscript"
        active={editor.isActive("superscript")}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        disabled={
          !editor.can().chain().focus().toggleSuperscript().run()
        }
      >
        <SuperscriptIcon size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Highlight"
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        disabled={!editor.can().chain().focus().toggleHighlight().run()}
      >
        <Highlighter size={iconSize} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Headings */}
      <ToolbarButton
        tooltip="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        <Heading1 size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Lists */}
      <ToolbarButton
        tooltip="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() =>
          editor.chain().focus().toggleOrderedList().run()
        }
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Blockquote"
        active={editor.isActive("blockquote")}
        onClick={() =>
          editor.chain().focus().toggleBlockquote().run()
        }
      >
        <Quote size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <CodeSquare size={iconSize} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Alignment */}
      <ToolbarButton
        tooltip="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() =>
          editor.chain().focus().setTextAlign("left").run()
        }
      >
        <AlignLeft size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() =>
          editor.chain().focus().setTextAlign("center").run()
        }
      >
        <AlignCenter size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() =>
          editor.chain().focus().setTextAlign("right").run()
        }
      >
        <AlignRight size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Justify"
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() =>
          editor.chain().focus().setTextAlign("justify").run()
        }
      >
        <AlignJustify size={iconSize} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* Insert */}
      <ToolbarButton
        tooltip="Horizontal rule"
        onClick={() =>
          editor.chain().focus().setHorizontalRule().run()
        }
      >
        <Minus size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Insert image"
        onClick={() => {
          const url = window.prompt("Enter the image URL:");
          if (url) {
            editor.chain().focus().setImage({ src: url }).run();
          }
        }}
      >
        <ImageIcon size={iconSize} />
      </ToolbarButton>

      <ToolbarSeparator />

      {/* History */}
      <ToolbarButton
        tooltip="Undo (Ctrl+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
      >
        <Undo2 size={iconSize} />
      </ToolbarButton>

      <ToolbarButton
        tooltip="Redo (Ctrl+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
      >
        <Redo2 size={iconSize} />
      </ToolbarButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rich text editor component
// ---------------------------------------------------------------------------

interface RichTextEditorProps {
  /** Initial HTML content for the editor */
  content?: string;
  /** Callback fired when the editor content changes (returns HTML string) */
  onChange?: (html: string) => void;
  /** Whether the editor is editable (default: true) */
  editable?: boolean;
  /** Placeholder shown when editor is empty */
  placeholder?: string;
  /** Additional class names applied to the outer wrapper */
  className?: string;
  /** Whether to show the toolbar (default: true) */
  showToolbar?: boolean;
}

function RichTextEditor({
  content = "",
  onChange,
  editable = true,
  placeholder,
  className,
  showToolbar = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    // SSR-safety: don't render until mounted on the client
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Highlight.configure({ multicolor: true }),
      Image,
      Subscript,
      Superscript,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Typography,
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "min-h-[150px] px-4 py-3"
        ),
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
  });

  return (
    <div
      className={cn(
        "rounded-lg border border-input bg-background shadow-xs",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        className
      )}
    >
      {showToolbar && editor && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

export {
  RichTextEditor,
  EditorToolbar,
  ToolbarButton,
  ToolbarSeparator,
  useEditor,
  type Editor,
  type RichTextEditorProps,
  type EditorToolbarProps,
  type ToolbarButtonProps,
};
