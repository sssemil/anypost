import { describe, it, expect } from "vitest";
import {
  createMobileViewState,
  transitionMobileView,
} from "./mobile-view-machine.js";

describe("Mobile view machine", () => {
  describe("createMobileViewState", () => {
    it("should start on group-list view with dev drawer open", () => {
      const state = createMobileViewState();

      expect(state.currentView).toBe("group-list");
      expect(state.isDevDrawerOpen).toBe(true);
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

    it("should close dev drawer when going back", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "group-selected" });
      state = transitionMobileView(state, { type: "dev-drawer-toggled" });

      const next = transitionMobileView(state, { type: "back-pressed" });

      expect(next.isDevDrawerOpen).toBe(false);
    });
  });

  describe("dev-drawer-toggled event", () => {
    it("should close dev drawer when open", () => {
      const state = createMobileViewState();

      const next = transitionMobileView(state, { type: "dev-drawer-toggled" });

      expect(next.isDevDrawerOpen).toBe(false);
    });

    it("should open dev drawer when closed", () => {
      let state = createMobileViewState();
      state = transitionMobileView(state, { type: "dev-drawer-toggled" });

      const next = transitionMobileView(state, { type: "dev-drawer-toggled" });

      expect(next.isDevDrawerOpen).toBe(true);
    });
  });

  describe("dev-drawer-closed event", () => {
    it("should close the dev drawer", () => {
      const state = createMobileViewState();

      const next = transitionMobileView(state, { type: "dev-drawer-closed" });

      expect(next.isDevDrawerOpen).toBe(false);
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
