import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

interface JobDescriptionProps {
  content: string;
}

/**
 * Renders a job description as Markdown (GitHub-flavored) with a popular,
 * well-maintained stack: react-markdown + remark-gfm. Job descriptions in the
 * corpus are sometimes Markdown and sometimes embed raw HTML, so rehype-raw
 * parses embedded HTML and rehype-sanitize strips anything unsafe (scripts,
 * event handlers, javascript: URLs) before render.
 */
export function JobDescription({ content }: JobDescriptionProps) {
  return (
    <div className="prose prose-sm max-w-none text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
