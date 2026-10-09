export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function readApiError(
  status: number,
  payload: unknown,
  fallback: string,
): ApiError {
  if (!payload || typeof payload !== "object") {
    return new ApiError(status, fallback || "Request failed");
  }
  const record = payload as Record<string, unknown>;
  const envelope = record.error;
  if (envelope && typeof envelope === "object") {
    const body = envelope as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    const message = typeof body.message === "string" ? body.message : fallback;
    const code = typeof body.code === "string" ? body.code : null;
    const details = formatDetails(body.details);
    return new ApiError(
      status,
      details ? `${message} (${details})` : message,
      code,
    );
  }
  if (typeof record.message === "string") {
    return new ApiError(status, record.message);
  }
  return new ApiError(status, fallback || "Request failed");
}

function formatDetails(details: unknown): string {
  if (!Array.isArray(details)) return "";
  return details
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as { path?: unknown; message?: unknown };
      const path = typeof row.path === "string" ? row.path : "";
      const message = typeof row.message === "string" ? row.message : "";
      if (path && message) return `${path}: ${message}`;
      return message || path;
    })
    .filter((part) => part.length > 0)
    .join("; ");
}
