import { cn } from "@statewalker/ui.view.shadcn";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Popover } from "radix-ui";
import { type ReactNode, useRef, useState } from "react";

/** PeerShare's help site: how to use it, how it works, why it is safe. */
export const HELP_URL = "https://peershare.httpeers.net/help/";

export interface HelpTipProps {
  /** What the tip is about, for its button's label and its heading: "Invites". */
  title: string;
  /** One or two sentences: what keeps this part safe, and how. */
  children: ReactNode;
  /** The help page (and section) that says more: `security#invites`. */
  help?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/**
 * A light "?" pill next to an element that matters for safety. Hover (with a
 * mouse), focus, or a tap opens a short explanation of how that part is kept
 * safe, with a link to the help site. A popover rather than a tooltip, so it
 * works on touch screens and its link can be clicked.
 */
export function HelpTip({ title, children, help, side = "bottom", className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => {
    clearTimeout(closing.current);
    setOpen(true);
  };
  // A moment's grace, so the pointer can travel from the pill to the card.
  const hide = () => {
    clearTimeout(closing.current);
    closing.current = setTimeout(() => setOpen(false), 180);
  };
  const mouse = (fn: () => void) => (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") fn();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`How this is kept safe: ${title}`}
          onPointerEnter={mouse(show)}
          onPointerLeave={mouse(hide)}
          className={cn(
            "border-border bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 data-[state=open]:bg-muted data-[state=open]:text-foreground inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center rounded-full border px-1.5 align-middle text-[11px] leading-none font-semibold transition-colors outline-none focus-visible:ring-[3px]",
            className,
          )}
        >
          ?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerEnter={mouse(show)}
          onPointerLeave={mouse(hide)}
          // Opening must not move the focus away from what the person was doing.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50 grid w-72 gap-2 rounded-lg border p-3 text-sm shadow-md"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="text-success size-4 shrink-0" /> {title}
          </p>
          <div className="text-muted-foreground grid gap-1.5 leading-relaxed">{children}</div>
          {help != null && (
            <a
              href={`${HELP_URL}${help}`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground inline-flex w-fit items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
            >
              Learn more<span className="sr-only"> about {title.toLowerCase()}</span>
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
