import type { Message } from "@statewalker/ai-agent/state";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useNodeContent } from "@/hooks/use-session-node";
import { cn } from "@/lib/utils";

export function ThinkingBlock({
  block,
}: {
  block: Message;
}): React.ReactElement {
  const text = useNodeContent(block) ?? "";
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border bg-muted/40"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight
          className={cn("h-3 w-3 transition-transform", open && "rotate-90")}
        />
        Reasoning
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2 pt-1 text-xs whitespace-pre-wrap text-muted-foreground">
        {text}
      </CollapsibleContent>
    </Collapsible>
  );
}
