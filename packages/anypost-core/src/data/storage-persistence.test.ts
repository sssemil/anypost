import { describe, it, expect } from "vitest";
import {
  createStoragePersistenceState,
  recordPersistenceResult,
  getPersistenceStatus,
  isPersistenceGranted,
} from "./storage-persistence.js";

describe("createStoragePersistenceState", () => {
  it("should start with unknown status", () => {
    const state = createStoragePersistenceState();

    expect(getPersistenceStatus(state)).toBe("unknown");
  });
});

describe("recordPersistenceResult", () => {
  it("should record granted status", () => {
    const state = createStoragePersistenceState();

    const updated = recordPersistenceResult(state, true);

    expect(getPersistenceStatus(updated)).toBe("granted");
  });

  it("should record denied status", () => {
    const state = createStoragePersistenceState();

    const updated = recordPersistenceResult(state, false);

    expect(getPersistenceStatus(updated)).toBe("denied");
  });
});

describe("isPersistenceGranted", () => {
  it("should return false for unknown status", () => {
    const state = createStoragePersistenceState();

    expect(isPersistenceGranted(state)).toBe(false);
  });

  it("should return true for granted status", () => {
    let state = createStoragePersistenceState();
    state = recordPersistenceResult(state, true);

    expect(isPersistenceGranted(state)).toBe(true);
  });

  it("should return false for denied status", () => {
    let state = createStoragePersistenceState();
    state = recordPersistenceResult(state, false);

    expect(isPersistenceGranted(state)).toBe(false);
  });
});

describe("immutability", () => {
  it("should not mutate original on recordPersistenceResult", () => {
    const original = createStoragePersistenceState();
    recordPersistenceResult(original, true);

    expect(getPersistenceStatus(original)).toBe("unknown");
  });
});
