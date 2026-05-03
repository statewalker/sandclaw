import { Navigate, Route, Routes } from "react-router";
import { DirectoryPicker } from "@/components/common/directory-picker";
import { MainShell } from "@/components/main-shell";
import { useWorkspace } from "@/contexts/workspace-context";

function Gate(): React.ReactElement {
  const { state } = useWorkspace();
  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (state.status !== "ready") {
    return <Navigate to="/pick-workspace" replace />;
  }
  return <MainShell />;
}

function PickerRoute(): React.ReactElement {
  const { state } = useWorkspace();
  // If the workspace is already ready (e.g., after a successful pick or a
  // silent restore), the picker page must hand off to the main shell;
  // otherwise the user stays staring at the picker after clicking "Open
  // folder".
  if (state.status === "ready") {
    return <Navigate to="/" replace />;
  }
  return <DirectoryPicker />;
}

export function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      <Route path="/pick-workspace" element={<PickerRoute />} />
      <Route path="/" element={<Gate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
