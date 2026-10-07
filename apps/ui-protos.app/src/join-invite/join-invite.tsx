import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@statewalker/ui.view.shadcn";
import { HardDrive, Loader2, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { officeMachine } from "../mock.js";

/** What the browser is doing with the invite. */
export type JoinState = "ready" | "connecting" | "failed";

function JoinAction({ state }: { state: JoinState }) {
  if (state === "connecting") {
    return (
      <Button className="w-full" disabled>
        <Loader2 className="animate-spin" /> Connecting to {officeMachine.name}…
      </Button>
    );
  }
  return (
    <Button className="w-full">
      {state === "failed" ? "Try again" : "Join and start chatting"}
    </Button>
  );
}

function FailureNote() {
  return (
    <div className="border-destructive/40 text-destructive flex gap-2 rounded-md border p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        The office machine did not answer. It may be switched off or asleep — ask whoever invited
        you to check it.
      </span>
    </div>
  );
}

/** Variant A: one card, one button; the privacy story is a single line. */
export function JoinCard({ state = "ready" }: { state?: JoinState }) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Join {officeMachine.owner}</CardTitle>
        <CardDescription>
          Your browser will connect directly to the team&apos;s AI on {officeMachine.name}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {state === "failed" && <FailureNote />}
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <Lock className="size-3.5" /> End-to-end encrypted. Nothing to install.
        </p>
      </CardContent>
      <CardFooter>
        <JoinAction state={state} />
      </CardFooter>
    </Card>
  );
}

const promises = [
  {
    icon: HardDrive,
    title: "The AI runs in your office",
    text: `${officeMachine.model} on ${officeMachine.name}. Questions never leave the company.`,
  },
  {
    icon: Lock,
    title: "Your files stay in this browser",
    text: "Documents and chats are stored on this device, not on a server.",
  },
  {
    icon: ShieldCheck,
    title: "Only your company's machines can read the link",
    text: "Traffic is end-to-end encrypted, even over public Wi-Fi.",
  },
];

/** Variant B: explain the three promises first, then join. */
export function JoinExplainer({ state = "ready" }: { state?: JoinState }) {
  const [step, setStep] = useState<"explain" | "join">("explain");
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>You&apos;re invited to {officeMachine.owner}&apos;s private AI</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {promises.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3">
            <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
            <div>
              <div className="text-sm font-medium">{title}</div>
              <div className="text-muted-foreground text-sm">{text}</div>
            </div>
          </div>
        ))}
        {state === "failed" && <FailureNote />}
      </CardContent>
      <CardFooter>
        {step === "explain" && state === "ready" ? (
          <Button className="w-full" onClick={() => setStep("join")}>
            Continue
          </Button>
        ) : (
          <JoinAction state={state} />
        )}
      </CardFooter>
    </Card>
  );
}
