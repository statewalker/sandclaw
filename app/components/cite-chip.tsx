import { cn } from "@/lib/utils";

/** Small clickable superscript that opens the source panel for a citation. */
export function CiteChip({
  label,
  uri,
  onClick,
  className,
}: {
  label: string | number;
  uri: string;
  onClick: (uri: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={uri}
      onClick={() => onClick(uri)}
      className={cn(
        "mx-0.5 inline-flex min-w-4 items-center justify-center rounded bg-primary/10 px-1 align-super text-[0.65rem] font-medium leading-tight text-primary transition-colors hover:bg-primary/20",
        className,
      )}
    >
      {label}
    </button>
  );
}
