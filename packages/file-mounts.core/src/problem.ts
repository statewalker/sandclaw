/** Why something cannot be used, in words a person reads; `detail` keeps the raw message. */
export type ProblemCause =
  | "invalid-settings"
  | "unreachable"
  | "cors"
  | "bad-keys"
  | "clock-skew"
  | "no-bucket"
  | "denied"
  | "timeout"
  | "locked"
  | "needs-access"
  | "unknown";

export interface Problem {
  cause: ProblemCause;
  message: string;
  detail?: string;
  fix?: { kind: "cors-rule"; json: string };
}

/** Raised by every operation on a mount that is locked, needs access or failed. */
export class MountUnavailable extends Error {
  constructor(
    readonly mount: string,
    readonly problem: Problem,
  ) {
    super(problem.message);
    this.name = "MountUnavailable";
  }
}

export function problemOf(error: unknown): Problem {
  if (error instanceof MountUnavailable) return error.problem;
  return { cause: "unknown", message: error instanceof Error ? error.message : String(error) };
}
