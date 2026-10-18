import { Home } from "lucide-react";
import type { ReactElement } from "react";

interface BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

/**
 * Path breadcrumb. A Home icon jumps to "/", followed by clickable
 * segments — every segment except the trailing one navigates on click.
 */
export function Breadcrumb({ path, onNavigate }: BreadcrumbProps): ReactElement {
  const segments = path.split("/").filter(Boolean);
  const crumbs = segments.map((label, i) => ({
    label,
    path: `/${segments.slice(0, i + 1).join("/")}`,
  }));
  const atRoot = crumbs.length === 0;

  return (
    <div className="flex items-center gap-0.5 text-xs font-mono px-2 py-0.5 flex-wrap">
      <button
        type="button"
        aria-label="Go to root"
        className={`flex items-center cursor-pointer bg-transparent border-none p-0 ${
          atRoot ? "text-foreground" : "text-primary hover:underline"
        }`}
        onClick={() => onNavigate("/")}
      >
        <Home className="size-3.5" />
      </button>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-0.5">
          <span className="text-muted-foreground">/</span>
          {i === crumbs.length - 1 ? (
            <span className="font-semibold">{crumb.label}</span>
          ) : (
            <button
              type="button"
              className="hover:underline text-primary cursor-pointer bg-transparent border-none p-0 font-mono text-xs"
              onClick={() => onNavigate(crumb.path)}
            >
              {crumb.label}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
