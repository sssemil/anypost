import { describe, it, expect } from "vitest";
import { Result } from "./result.js";

describe("Result", () => {
  it("should carry data on success", () => {
    const result = Result.success(42);

    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
  });

  it("should carry error on failure", () => {
    const error = new Error("something went wrong");
    const result = Result.failure(error);

    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
  });

  it("should narrow type via success discriminant", () => {
    const process = (value: number): Result<number, Error> =>
      value > 0 ? Result.success(value) : Result.failure(new Error("bad"));

    const result = process(42);

    if (result.success) {
      const value: number = result.data;
      expect(value).toBe(42);
    } else {
      const err: Error = result.error;
      expect.unreachable(`should not reach failure branch: ${err.message}`);
    }
  });

  it("should narrow type via failure discriminant", () => {
    const process = (value: number): Result<number, Error> =>
      value > 0 ? Result.success(value) : Result.failure(new Error("bad"));

    const result = process(-1);

    if (!result.success) {
      const err: Error = result.error;
      expect(err.message).toBe("bad");
    } else {
      expect.unreachable("should not reach success branch");
    }
  });

  it("should work with custom error types", () => {
    type ValidationError = {
      readonly field: string;
      readonly message: string;
    };

    const error: ValidationError = {
      field: "email",
      message: "invalid format",
    };
    const result = Result.failure<ValidationError>(error);

    expect(result.success).toBe(false);
    expect(result.error.field).toBe("email");
    expect(result.error.message).toBe("invalid format");
  });

  it("should preserve complex data types on success", () => {
    type User = { readonly id: string; readonly name: string };
    const user: User = { id: "u1", name: "Alice" };
    const result = Result.success(user);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "u1", name: "Alice" });
  });
});
