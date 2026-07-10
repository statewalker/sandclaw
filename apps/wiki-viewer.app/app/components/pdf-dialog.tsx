import { PdfView } from "@/components/pdf-view";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PdfRequest } from "@/lib/types";

export function PdfDialog({
  project,
  request,
  onOpenChange,
}: {
  project: string;
  request: PdfRequest | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = request !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[92vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[95vw]"
      >
        <DialogHeader className="border-b px-4 py-2.5">
          <DialogTitle className="truncate pr-8 text-sm font-medium">
            {request?.title ?? "Document"}
            {request ? (
              <span className="text-muted-foreground">
                {" "}
                · page {request.page}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {request && (
            <PdfView
              project={project}
              file={request.file}
              page={request.page}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
