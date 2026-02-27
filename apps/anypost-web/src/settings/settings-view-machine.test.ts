import { describe, it, expect } from "vitest";
import {
  createSettingsViewState,
  transitionSettingsView,
} from "./settings-view-machine.js";

describe("Settings view machine", () => {
  describe("createSettingsViewState", () => {
    it("should start on main view", () => {
      const state = createSettingsViewState();

      expect(state.currentView).toBe("main");
    });
  });

  describe("devices-opened event", () => {
    it("should navigate to devices view", () => {
      const state = createSettingsViewState();

      const next = transitionSettingsView(state, { type: "devices-opened" });

      expect(next.currentView).toBe("devices");
    });
  });

  describe("back-pressed event", () => {
    it("should navigate back to main view from devices", () => {
      let state = createSettingsViewState();
      state = transitionSettingsView(state, { type: "devices-opened" });

      const next = transitionSettingsView(state, { type: "back-pressed" });

      expect(next.currentView).toBe("main");
    });

    it("should stay on main view when already on main", () => {
      const state = createSettingsViewState();

      const next = transitionSettingsView(state, { type: "back-pressed" });

      expect(next.currentView).toBe("main");
    });
  });

  describe("immutability", () => {
    it("should not mutate original state", () => {
      const original = createSettingsViewState();
      transitionSettingsView(original, { type: "devices-opened" });

      expect(original.currentView).toBe("main");
    });
  });
});
