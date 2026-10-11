import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  type FileMessagePartComponent,
  type ImageMessagePartComponent,
  MessagePrimitive,
  type TextMessagePartComponent,
  ThreadPrimitive,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { Button } from "@statewalker/ui.view.shadcn";
import { FileText, SendHorizontal, Square } from "lucide-react";
import type { ReactNode } from "react";
import { type MockFlueSession, useFlueRuntime } from "./flue-runtime.js";

// A minimal chat thread from assistant-ui primitives: messages and a composer
// with send / stop. No edit, regenerate or branch controls: a Flue session is
// linear. Each prototype passes its own tool UIs (by tool name) and, if it needs
// to, its own renderer for assistant or user text, its own composer, and what
// to show after the messages (e.g. messages waiting to be sent). A reply that
// was stopped is marked "Stopped".

export interface ThreadProps {
  /** Tool UIs by tool name, e.g. `{ ask: AskToolUI }`. */
  tools?: Record<string, ToolCallMessagePartComponent>;
  /** Renders assistant text (e.g. to turn [1] into citation links). */
  Text?: TextMessagePartComponent;
  placeholder?: string;
  /** Shown while the conversation is empty. */
  empty?: ReactNode;
  /** Renders user text (e.g. to show the files a message refers to as chips). */
  UserText?: TextMessagePartComponent;
  /** Shown after the messages, in the scrolling area. */
  afterMessages?: ReactNode;
  /** Replaces the default composer; it is rendered inside the runtime. */
  composer?: ReactNode;
}

const PlainText: TextMessagePartComponent = ({ text }) => (
  <p className="whitespace-pre-wrap">{text}</p>
);

/** An image sent with a user message. */
const UserImage: ImageMessagePartComponent = ({ image, filename }) => (
  <img src={image} alt={filename ?? "Image"} className="my-1 max-h-40 rounded-md" />
);

/** A PDF sent with a user message. */
const UserFile: FileMessagePartComponent = ({ filename }) => (
  <span className="my-1 flex items-center gap-1.5 text-xs">
    <FileText className="size-3.5 shrink-0" /> {filename ?? "Document"}
  </span>
);

export function Thread({
  tools,
  Text = PlainText,
  placeholder = "Ask about your files…",
  empty,
  UserText = PlainText,
  afterMessages,
  composer,
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
                  <MessagePrimitive.Parts
                    components={{ Text: UserText, Image: UserImage, File: UserFile }}
                  />
                </div>
              </MessagePrimitive.Root>
            ) : (
              <MessagePrimitive.Root className="flex min-w-0 flex-col gap-2 text-sm">
                <MessagePrimitive.Parts components={{ Text, tools: { by_name: tools } }} />
                <AuiIf
                  condition={(s) =>
                    s.message.status?.type === "incomplete" &&
                    s.message.status.reason === "cancelled"
                  }
                >
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Square className="size-3" /> Stopped
                  </p>
                </AuiIf>
              </MessagePrimitive.Root>
            )
          }
        </ThreadPrimitive.Messages>
        <AuiIf condition={(s) => s.thread.isRunning && s.thread.messages.at(-1)?.role === "user"}>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            Thinking…
          </p>
        </AuiIf>
        {afterMessages}
      </ThreadPrimitive.Viewport>
      {composer ?? <DefaultComposer placeholder={placeholder} />}
    </ThreadPrimitive.Root>
  );
}

function DefaultComposer({ placeholder }: { placeholder: string }) {
  return (
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
