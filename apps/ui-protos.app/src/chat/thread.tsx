import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  type TextMessagePartComponent,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { Button } from "@statewalker/ui.view.shadcn";
import { SendHorizontal, Square } from "lucide-react";
import type { ReactNode } from "react";
import { type MockFlueSession, useFlueRuntime } from "./flue-runtime.js";

// A minimal chat thread from assistant-ui primitives: messages and a composer
// with send / stop. No edit, regenerate or branch controls: a Flue session is
// linear. Each prototype passes its own tool UIs (by tool name) and, if it needs
// to, its own renderer for assistant text.

export interface ThreadProps {
  /** Tool UIs by tool name, e.g. `{ ask: AskToolUI }`. */
  tools?: Record<string, ToolCallMessagePartComponent>;
  /** Renders assistant text (e.g. to turn [1] into citation links). */
  Text?: TextMessagePartComponent;
  placeholder?: string;
  /** Shown while the conversation is empty. */
  empty?: ReactNode;
}

const PlainText: TextMessagePartComponent = ({ text }) => (
  <p className="whitespace-pre-wrap">{text}</p>
);

export function Thread({
  tools,
  Text = PlainText,
  placeholder = "Ask about your files…",
  empty,
}: ThreadProps) {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {empty && <AuiIf condition={(s) => s.thread.isEmpty}>{empty}</AuiIf>}
        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === "user" ? (
              <MessagePrimitive.Root className="flex justify-end">
                <div className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl px-3.5 py-2 text-sm">
                  <MessagePrimitive.Parts />
                </div>
              </MessagePrimitive.Root>
            ) : (
              <MessagePrimitive.Root className="flex min-w-0 flex-col gap-2 text-sm">
                <MessagePrimitive.Parts components={{ Text, tools: { by_name: tools } }} />
              </MessagePrimitive.Root>
            )
          }
        </ThreadPrimitive.Messages>
        <AuiIf condition={(s) => s.thread.isRunning && s.thread.messages.at(-1)?.role === "user"}>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Thinking…
          </p>
        </AuiIf>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="flex items-end gap-2 border-t p-2">
        <ComposerPrimitive.Input
          aria-label="Message"
          placeholder={placeholder}
          rows={1}
          className="bg-background min-h-9 min-w-0 flex-1 resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
        />
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <Button size="icon" aria-label="Send">
              <SendHorizontal />
            </Button>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button size="icon" variant="outline" aria-label="Stop">
              <Square />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

/** A thread over a Flue session. */
export function FlueThread({ session, ...props }: ThreadProps & { session: MockFlueSession }) {
  const runtime = useFlueRuntime(session);
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread {...props} />
    </AssistantRuntimeProvider>
  );
}
