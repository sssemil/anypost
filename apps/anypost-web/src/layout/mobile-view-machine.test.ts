import { describe, it, expect } from "vitest";
import {
  createMobileViewState,
  transitionMobileView,
} from "./mobile-view-machine.js";

describe("Mobile view machine", () => {
  describe("createMobileViewState", () => {
    it("should start on group-list view with dev-tools panel open", () => {
      const state = createMobileViewState();

      expect(state.currentView).toBe("group-list");
      expect(state.rightPanel).toBe("dev-tools");
    });
  });

  describe("group-selected event", () => {
    it("should switch to chat view", () => {
      const state = createMobileViewState();

      const next = transitionMobileView(state, { type: "group-selected" });

      expect(next.currentView).toBe("chat");
    });
  });

  describe("back-pressed event", () => {
    it("should switch to group-list view", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "group-selected" });

      const next = transitionMobileView(state, { type: "back-pressed" });

      expect(next.currentView).toBe("group-list");
    });

    it("should close right panel when going back", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "group-selected" });
      state = transitionMobileView(state, { type: "dev-drawer-toggled" });

      const next = transitionMobileView(state, { type: "back-pressed" });

      expect(next.rightPanel).toBe("none");
    });
  });

  describe("dev-drawer-toggled event", () => {
    it("should close dev-tools panel when open", () => {
      const state = createMobileViewState();

      const next = transitionMobileView(state, { type: "dev-drawer-toggled" });

      expect(next.rightPanel).toBe("none");
    });

    it("should open dev-tools panel when closed", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "dev-drawer-toggled" });

      const next = transitionMobileView(state, { type: "dev-drawer-toggled" });

      expect(next.rightPanel).toBe("dev-tools");
    });

    it("should replace group-info panel with dev-tools", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "group-info-toggled" });
      expect(state.rightPanel).toBe("group-info");

      const next = transitionMobileView(state, { type: "dev-drawer-toggled" });

      expect(next.rightPanel).toBe("dev-tools");
    });
  });

  describe("dev-drawer-closed event", () => {
    it("should close the right panel", () => {
      const state = createMobileViewState();

      const next = transitionMobileView(state, { type: "dev-drawer-closed" });

      expect(next.rightPanel).toBe("none");
    });
  });

  describe("group-info-toggled event", () => {
    it("should open group-info panel when closed", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "dev-drawer-toggled" });
      expect(state.rightPanel).toBe("none");

      const next = transitionMobileView(state, { type: "group-info-toggled" });

      expect(next.rightPanel).toBe("group-info");
    });

    it("should close group-info panel when open", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "group-info-toggled" });
      expect(state.rightPanel).toBe("group-info");

      const next = transitionMobileView(state, { type: "group-info-toggled" });

      expect(next.rightPanel).toBe("none");
    });

    it("should replace dev-tools panel with group-info", () => {
      const state = createMobileViewState();
      expect(state.rightPanel).toBe("dev-tools");

      const next = transitionMobileView(state, { type: "group-info-toggled" });

      expect(next.rightPanel).toBe("group-info");
    });
  });

  describe("group-info-closed event", () => {
    it("should close the right panel", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "group-info-toggled" });

      const next = transitionMobileView(state, { type: "group-info-closed" });

      expect(next.rightPanel).toBe("none");
    });
  });

  describe("immutability", () => {
    it("should not mutate original state", () => {
      const original = createMobileViewState();
      transitionMobileView(original, { type: "group-selected" });

      expect(original.currentView).toBe("group-list");
    });
  });
});
