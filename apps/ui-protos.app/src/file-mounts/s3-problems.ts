import type { Problem } from "../file-panels/problem.js";

export interface S3ErrorLike {
  name?: string;
  message?: string;
  $metadata?: { httpStatusCode?: number };
}

export type CheckId = "endpoint" | "keys" | "bucket" | "list" | "write";

/** The bucket CORS rule that lets the browser talk to S3 from `origin`. */
export function corsRule(origin: string): string {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
        AllowedHeaders: [
          "authorization",
          "content-type",
          "content-md5",
          "x-amz-content-sha256",
          "x-amz-date",
          "x-amz-security-token",
          "x-amz-user-agent",
          "x-amz-copy-source",
          "x-amz-metadata-directive",
          "amz-sdk-invocation-id",
          "amz-sdk-request",
        ],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3000,
      },
    ],
    null,
    2,
  );
}

function asErrorLike(error: unknown): S3ErrorLike {
  return typeof error === "object" && error !== null
    ? (error as S3ErrorLike)
    : { message: String(error) };
}

/** Turns a raw S3 or fetch error into a problem a person can act on; `detail` keeps the raw text. */
export function classifyS3Error(
  error: unknown,
  ctx: { check: CheckId; endpoint: string; bucket: string; origin: string; hostAnswers?: boolean },
): Problem {
  const err = asErrorLike(error);
  const name = err.name ?? "Error";
  const message = err.message ?? "";
  const detail = `${name}: ${message}`;
  const isNetwork =
    name === "NetworkError" || (name === "TypeError" && message.includes("Failed to fetch"));

  if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch") {
    return { cause: "bad-keys", message: "Wrong access key or secret.", detail };
  }
  if (name === "RequestTimeTooSkewed") {
    return {
      cause: "clock-skew",
      message: "This computer's clock is off by more than 15 minutes; S3 refuses the request.",
      detail,
    };
  }
  if (name === "NoSuchBucket") {
    return {
      cause: "no-bucket",
      message: `Bucket \`${ctx.bucket}\` not found at this endpoint.`,
      detail,
    };
  }
  if (name === "AccessDenied" || err.$metadata?.httpStatusCode === 403) {
    return {
      cause: "denied",
      message:
        ctx.check === "write"
          ? "These keys can't write to this bucket."
          : "These keys can't list this bucket.",
      detail,
    };
  }
  if (name === "TimeoutError" || name === "AbortError") {
    return { cause: "timeout", message: "No answer in 15 seconds.", detail };
  }
  if (isNetwork) {
    if (ctx.hostAnswers) {
      return {
        cause: "cors",
        message: "The bucket doesn't allow this site. Add this CORS rule to the bucket:",
        detail,
        fix: { kind: "cors-rule", json: corsRule(ctx.origin) },
      };
    }
    return { cause: "unreachable", message: `No answer from ${ctx.endpoint}.`, detail };
  }
  return { cause: "unknown", message: "The storage refused the request.", detail };
}
