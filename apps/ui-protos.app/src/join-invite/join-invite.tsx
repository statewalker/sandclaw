import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@statewalker/ui.view.shadcn";
import { FolderOpen, HardDrive, Loader2, Lock, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { group } from "../mock.js";

/**
 * How the invite page explains itself:
 * - `minimal`: one card, one button, privacy in one line;
 * - `promises`: the three promises first, then join.
 */
export type JoinVariant = "minimal" | "promises";

/** What happens when the browser tries to join. */
export type JoinOutcome = "joined" | "machine-offline" | "invite-used";

type Stage = "invite" | "joining" | JoinOutcome | "opening";

export interface JoinFlowProps {
  variant?: JoinVariant;
  outcome?: JoinOutcome;
  /** Where the story starts; the flow then runs on its own. */
  start?: "invite" | "joined";
  /** How long joining takes, in ms. */
  joinMs?: number;
}

const promises = [
  {
    icon: HardDrive,
    title: "The assistant runs on your group's Sandclaw machine",
    text: "Your questions never go to an outside AI company.",
  },
  {
    icon: MonitorSmartphone,
    title: "Your files stay on this device",
    text: "Documents and chats are kept in this browser, not on a server.",
  },
  {
    icon: ShieldCheck,
    title: "Only your group's devices can read the connection",
    text: "It is end-to-end encrypted, even on public Wi-Fi.",
  },
];

function Frame({ children }: { children: React.ReactNode }) {
  return <Card className="w-full max-w-md">{children}</Card>;
}

export function JoinFlow({
  variant = "minimal",
  outcome = "joined",
  start = "invite",
  joinMs = 1200,
}: JoinFlowProps) {
  const [stage, setStage] = useState<Stage>(start);
  const join = () => {
    setStage("joining");
    setTimeout(() => setStage(outcome), joinMs);
  };

  if (stage === "joined" || stage === "opening") {
    return (
      <Frame>
        <CardHeader>
          <CardTitle>You&apos;re in {group.name}</CardTitle>
          <CardDescription>
            Choose the folder the assistant works with. It can read what is in it, and it asks
            before changing anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button disabled={stage === "opening"} onClick={() => setStage("opening")}>
            {stage === "opening" ? <Loader2 className="animate-spin" /> : <FolderOpen />} Open a
            folder on this computer
          </Button>
          <Button
            variant="outline"
            disabled={stage === "opening"}
            onClick={() => setStage("opening")}
          >
            Start with an empty folder in this browser
          </Button>
        </CardContent>
      </Frame>
    );
  }

  if (stage === "invite-used") {
    return (
      <Frame>
        <CardHeader>
          <CardTitle>This invite link has already been used</CardTitle>
          <CardDescription>
            Each invite works once. Ask {group.admin} for a new link.
          </CardDescription>
        </CardHeader>
      </Frame>
    );
  }

  const offline = stage === "machine-offline";
  const joining = stage === "joining";
  const action = (
    <Button className="w-full" disabled={joining} onClick={join}>
      {joining ? (
        <>
          <Loader2 className="animate-spin" /> Joining {group.name}…
        </>
      ) : offline ? (
        "Try again"
      ) : (
        `Join ${group.name}`
      )}
    </Button>
  );
  const offlineNote = offline && (
    <p className="border-warning/60 rounded-md border p-3 text-sm">
      The Sandclaw machine isn&apos;t answering. Ask {group.admin} to check it&apos;s switched on,
      then try again.
    </p>
  );

  if (variant === "minimal") {
    return (
      <Frame>
        <CardHeader>
          <CardTitle>
            {group.admin} invited you to {group.name}
          </CardTitle>
          <CardDescription>
            A private assistant for your documents. Nothing to install.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {offlineNote}
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Lock className="size-3.5" /> Your files and questions stay within {group.name}.
          </p>
        </CardContent>
        <CardFooter>{action}</CardFooter>
      </Frame>
    );
  }

  return (
    <Frame>
      <CardHeader>
        <CardTitle>
          {group.admin} invited you to {group.name}
        </CardTitle>
        <CardDescription>
          A private assistant for your documents. Nothing to install.
        </CardDescription>
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
        {offlineNote}
      </CardContent>
      <CardFooter>{action}</CardFooter>
    </Frame>
  );
}
