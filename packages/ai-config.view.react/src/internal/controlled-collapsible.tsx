import { useStateBinding } from "@statewalker/render.view.react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@statewalker/ui.view.shadcn";
import type { ReactElement, ReactNode } from "react";

interface ControlledCollapsibleProps {
  props: {
    title: string;
    /** State path holding the open boolean (e.g. `/ui/form/settingsOpen`). */
    openPath: string;
  };
  children?: ReactNode;
}

/**
 * Catalog `Collapsible` binding — a **controlled** variant of the stock
 * `@json-render/shadcn` Collapsible. Its open state lives in the spec store at
 * `props.openPath`, so an action handler (`connectConnection`) can fold the
 * credential form on a successful connect, and the user can re-expand it to
 * edit. The stock Collapsible is uncontrolled (`defaultOpen` only) and cannot
 * be driven from state.
 */
export function ControlledCollapsible({
  props,
  children,
}: ControlledCollapsibleProps): ReactElement {
  const [open, setOpen] = useStateBinding<boolean>(props.openPath);
  const isOpen = open ?? false;
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setOpen}
      className="w-full rounded-lg border border-border"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium hover:bg-accent/40">
        <span className={cn("text-muted-foreground transition-transform", isOpen && "rotate-90")}>
          ▸
        </span>
        {props.title}
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border">{children}</CollapsibleContent>
    </Collapsible>
  );
}
