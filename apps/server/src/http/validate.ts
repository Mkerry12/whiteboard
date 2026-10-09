import type { ZodType } from "zod";
import { ErrorCode, HttpError } from "../errors.js";

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new HttpError(
    400,
    ErrorCode.VALIDATION_ERROR,
    "Request validation failed",
    result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  );
}
