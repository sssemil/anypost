import { describe, it, expect } from "vitest";
import {
  createInitialState,
  transition,
  type OnboardingState,
} from "./onboarding-machine.js";

describe("Onboarding State Machine", () => {
  describe("initial state", () => {
    it("should start in checking status", () => {
      const state = createInitialState();
      expect(state.status).toBe("checking");
    });
  });

  describe("checking → no-account", () => {
    it("should transition to no-account when no key found", () => {
      const state = createInitialState();
      const next = transition(state, { type: "no-key-found" });
      expect(next.status).toBe("no-account");
    });
  });

  describe("checking → ready", () => {
    it("should transition to ready when key found", () => {
      const state = createInitialState();
      const publicKey = new Uint8Array(32);
      const privateKey = new Uint8Array(32);
      const next = transition(state, {
        type: "key-found",
        accountKey: { publicKey, privateKey },
        backedUp: true,
      });

      expect(next.status).toBe("ready");
      if (next.status === "ready") {
        expect(next.accountKey.publicKey).toBe(publicKey);
        expect(next.backupPending).toBe(false);
      }
    });

    it("should set backup pending when key found but not backed up", () => {
      const state = createInitialState();
      const publicKey = new Uint8Array(32);
      const privateKey = new Uint8Array(32);
      const next = transition(state, {
        type: "key-found",
        accountKey: { publicKey, privateKey },
        backedUp: false,
      });

      expect(next.status).toBe("ready");
      if (next.status === "ready") {
        expect(next.backupPending).toBe(true);
      }
    });
  });

  describe("no-account → display-name-prompt", () => {
    it("should transition to display-name-prompt on generate", () => {
      const state: OnboardingState = { status: "no-account" };
      const publicKey = new Uint8Array(32);
      const privateKey = new Uint8Array(32);
      const next = transition(state, {
        type: "key-generated",
        accountKey: { publicKey, privateKey },
      });

      expect(next.status).toBe("display-name-prompt");
      if (next.status === "display-name-prompt") {
        expect(next.accountKey.publicKey).toBe(publicKey);
      }
    });
  });

  describe("no-account → display-name-prompt (import)", () => {
    it("should transition to display-name-prompt on import", () => {
      const state: OnboardingState = { status: "no-account" };
      const publicKey = new Uint8Array(32);
      const privateKey = new Uint8Array(32);
      const next = transition(state, {
        type: "key-imported",
        accountKey: { publicKey, privateKey },
      });

      expect(next.status).toBe("display-name-prompt");
      if (next.status === "display-name-prompt") {
        expect(next.accountKey.publicKey).toBe(publicKey);
      }
    });
  });

  describe("display-name-prompt → ready", () => {
    it("should transition to ready when display name set", () => {
      const publicKey = new Uint8Array(32);
      const privateKey = new Uint8Array(32);
      const state: OnboardingState = {
        status: "display-name-prompt",
        accountKey: { publicKey, privateKey },
      };

      const next = transition(state, {
        type: "display-name-set",
        displayName: "Alice",
      });

      expect(next.status).toBe("ready");
      if (next.status === "ready") {
        expect(next.accountKey.publicKey).toBe(publicKey);
        expect(next.backupPending).toBe(true);
      }
    });
  });

  describe("ready → backup complete", () => {
    it("should clear backup pending on backup-completed", () => {
      const publicKey = new Uint8Array(32);
      const privateKey = new Uint8Array(32);
      const state: OnboardingState = {
        status: "ready",
        accountKey: { publicKey, privateKey },
        backupPending: true,
      };

      const next = transition(state, { type: "backup-completed" });

      expect(next.status).toBe("ready");
      if (next.status === "ready") {
        expect(next.backupPending).toBe(false);
      }
    });
  });

  describe("invalid transitions", () => {
    it("should return same state for invalid event in checking", () => {
      const state = createInitialState();
      const next = transition(state, { type: "backup-completed" });
      expect(next).toBe(state);
    });

    it("should return same state for invalid event in ready", () => {
      const publicKey = new Uint8Array(32);
      const privateKey = new Uint8Array(32);
      const state: OnboardingState = {
        status: "ready",
        accountKey: { publicKey, privateKey },
        backupPending: false,
      };

      const next = transition(state, { type: "no-key-found" });
      expect(next).toBe(state);
    });
  });
});
