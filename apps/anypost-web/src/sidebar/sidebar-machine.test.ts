import { describe, it, expect } from "vitest";
import {
  createSidebarState,
  transitionSidebar,
  isValidGroupIdInput,
} from "./sidebar-machine.js";

describe("Sidebar machine", () => {
  describe("createSidebarState", () => {
    it("should start with form closed and empty input", () => {
      const state = createSidebarState();

      expect(state.isJoinFormOpen).toBe(false);
      expect(state.joinInput).toBe("");
      expect(state.joinError).toBeNull();
    });
  });

  describe("open join form", () => {
    it("should open the join form", () => {
      const state = createSidebarState();

      const next = transitionSidebar(state, { type: "join-form-opened" });

      expect(next.isJoinFormOpen).toBe(true);
    });
  });

  describe("close join form", () => {
    it("should close the form and clear input and error", () => {
      let state = createSidebarState();
      state = transitionSidebar(state, { type: "join-form-opened" });
      state = transitionSidebar(state, { type: "join-input-changed", value: "abc" });

      const next = transitionSidebar(state, { type: "join-form-closed" });

      expect(next.isJoinFormOpen).toBe(false);
      expect(next.joinInput).toBe("");
      expect(next.joinError).toBeNull();
    });
  });

  describe("input change", () => {
    it("should update the join input value", () => {
      const state = createSidebarState();

      const next = transitionSidebar(state, {
        type: "join-input-changed",
        value: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      });

      expect(next.joinInput).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    });

    it("should clear any previous error on input change", () => {
      let state = createSidebarState();
      state = transitionSidebar(state, { type: "join-form-opened" });
      state = transitionSidebar(state, {
        type: "join-failed",
        error: "Invalid format",
      });

      const next = transitionSidebar(state, {
        type: "join-input-changed",
        value: "new-input",
      });

      expect(next.joinError).toBeNull();
    });
  });

  describe("join failed", () => {
    it("should set error message", () => {
      const state = createSidebarState();

      const next = transitionSidebar(state, {
        type: "join-failed",
        error: "Invalid group ID format",
      });

      expect(next.joinError).toBe("Invalid group ID format");
    });
  });

  describe("join succeeded", () => {
    it("should close form and clear input", () => {
      let state = createSidebarState();
      state = transitionSidebar(state, { type: "join-form-opened" });
      state = transitionSidebar(state, {
        type: "join-input-changed",
        value: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      });

      const next = transitionSidebar(state, { type: "join-succeeded" });

      expect(next.isJoinFormOpen).toBe(false);
      expect(next.joinInput).toBe("");
      expect(next.joinError).toBeNull();
    });
  });

  describe("isValidGroupIdInput", () => {
    it("should accept valid UUID v4 format", () => {
      expect(isValidGroupIdInput("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(true);
    });

    it("should accept uppercase UUIDs", () => {
      expect(isValidGroupIdInput("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(true);
    });

    it("should reject empty string", () => {
      expect(isValidGroupIdInput("")).toBe(false);
    });

    it("should reject non-UUID strings", () => {
      expect(isValidGroupIdInput("not-a-uuid")).toBe(false);
    });

    it("should reject partial UUIDs", () => {
      expect(isValidGroupIdInput("a0eebc99-9c0b-4ef8")).toBe(false);
    });
  });

  describe("immutability", () => {
    it("should not mutate original state", () => {
      const original = createSidebarState();
      transitionSidebar(original, { type: "join-form-opened" });

      expect(original.isJoinFormOpen).toBe(false);
    });
  });
});
