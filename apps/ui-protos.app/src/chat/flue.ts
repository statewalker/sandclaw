// The Flue SDK shapes the chat prototypes rely on. They mirror `@flue/sdk` 2.2
// (`FlueConversationMessage`, `FlueConversationPart`, `FlueConversationSettlement`,
// `DeliveredMessage`) and are copied here, not imported: Flue is not installed in
// the prototypes. Keep them field-for-field identical so the chat layer can later
// be fed by `useFlueAgent()` instead of the mock session.

export interface DeliveredImageAttachment {
  type: "image";
  data: string;
  mimeType: string;
  filename?: string;
}

export interface DeliveredDocumentAttachment {
  type: "document";
  data: string;
  mimeType: "application/pdf";
  filename?: string;
}

export type DeliveredAttachment = DeliveredImageAttachment | DeliveredDocumentAttachment;

export type DeliveredMessage =
  | { kind: "user"; body: string; attachments?: DeliveredAttachment[] }
  | {
      kind: "signal";
      type: string;
      body: string;
      attributes?: Record<string, string>;
      tagName?: string;
    };

export type FlueConversationPart =
  | { type: "text"; text: string; state: "streaming" | "done" }
  | { type: "reasoning"; text: string; state: "streaming" | "done" }
  | { type: `data-${string}`; data: unknown }
  | {
      type: "file";
      mediaType: string;
      id?: string;
      size?: number;
      url?: string;
      filename?: string;
    }
  | ({ type: "dynamic-tool"; toolName: string; toolCallId: string } & (
      | { state: "input-available"; input: unknown }
      | { state: "output-available"; input: unknown; output: unknown; durationMs?: number }
      | { state: "output-error"; input: unknown; errorText: string; durationMs?: number }
    ));

export interface FlueConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  purpose: "user" | "assistant" | "dispatch" | "advisory";
  display: "visible" | "hidden" | "diagnostic";
  submissionId?: string;
  turnId?: string;
  signal?: { tagName?: string; attributes?: Record<string, string> };
  settlement?: { outcome: "failed" | "aborted" };
  timestamp?: string;
  parts: FlueConversationPart[];
  metadata?: Record<string, unknown>;
}

export interface FlueConversationSettlement {
  submissionId: string;
  outcome: "completed" | "failed" | "aborted";
  error?: unknown;
  answeredBySubmissionId?: string;
  timestamp?: string;
}
