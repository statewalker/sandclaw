import { TriangleAlert } from "lucide-react";

export function ErrorBlock({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex w-full justify-start">
      <div className="flex max-w-[80%] items-start gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="break-words">{text}</p>
      </div>
    </div>
  );
}
