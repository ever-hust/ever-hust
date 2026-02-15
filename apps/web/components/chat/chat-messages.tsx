import type { UIMessage } from "ai";
import { Bot, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@repo/ui/avatar";
import { cn } from "@repo/ui/lib/utils";
import { AgentStatus } from "./agent-status";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "flex gap-3",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {message.role !== "user" && (
            <Avatar className="mt-0.5 h-7 w-7 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          )}

          <div
            className={cn(
              "max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed",
              message.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            )}
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div key={i} className="whitespace-pre-wrap">
                    {part.text}
                  </div>
                );
              }
              // Handle tool invocations (dynamic-tool or tool-* types)
              if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
                const toolPart = part as {
                  type: string;
                  toolName?: string;
                  state: string;
                };
                const toolName =
                  toolPart.toolName ??
                  (toolPart.type.startsWith("tool-")
                    ? toolPart.type.slice(5)
                    : "tool");
                const isComplete = toolPart.state === "output-available";
                return (
                  <AgentStatus
                    key={i}
                    toolName={toolName}
                    state={isComplete ? "complete" : "running"}
                  />
                );
              }
              return null;
            })}
          </div>

          {message.role === "user" && (
            <Avatar className="mt-0.5 h-7 w-7 shrink-0">
              <AvatarFallback className="text-xs">
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      ))}

      {isLoading && (
        <div className="flex gap-3">
          <Avatar className="mt-0.5 h-7 w-7 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1 rounded-xl bg-muted px-4 py-2.5">
            <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50" />
            <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50 delay-150" />
            <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground/50 delay-300" />
          </div>
        </div>
      )}
    </div>
  );
}
