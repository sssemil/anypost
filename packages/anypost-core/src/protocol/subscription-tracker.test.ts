import { describe, it, expect } from "vitest";
import {
  createSubscriptionTracker,
  addSubscription,
  removeSubscription,
  getSubscriptions,
  clearSubscriptions,
} from "./subscription-tracker.js";

describe("Subscription tracker", () => {
  describe("createSubscriptionTracker", () => {
    it("should start with no subscriptions", () => {
      const tracker = createSubscriptionTracker();

      expect(getSubscriptions(tracker)).toEqual([]);
    });
  });

  describe("addSubscription", () => {
    it("should add a topic", () => {
      const tracker = createSubscriptionTracker();

      const updated = addSubscription(tracker, "group/abc/messages");

      expect(getSubscriptions(updated)).toEqual(["group/abc/messages"]);
    });

    it("should not add duplicate topics", () => {
      let tracker = createSubscriptionTracker();
      tracker = addSubscription(tracker, "group/abc/messages");

      const updated = addSubscription(tracker, "group/abc/messages");

      expect(getSubscriptions(updated)).toEqual(["group/abc/messages"]);
    });

    it("should track multiple topics", () => {
      let tracker = createSubscriptionTracker();
      tracker = addSubscription(tracker, "group/abc/messages");
      tracker = addSubscription(tracker, "group/xyz/messages");

      expect(getSubscriptions(tracker)).toEqual([
        "group/abc/messages",
        "group/xyz/messages",
      ]);
    });
  });

  describe("removeSubscription", () => {
    it("should remove a tracked topic", () => {
      let tracker = createSubscriptionTracker();
      tracker = addSubscription(tracker, "group/abc/messages");
      tracker = addSubscription(tracker, "group/xyz/messages");

      const updated = removeSubscription(tracker, "group/abc/messages");

      expect(getSubscriptions(updated)).toEqual(["group/xyz/messages"]);
    });

    it("should be a no-op for untracked topics", () => {
      const tracker = createSubscriptionTracker();

      const updated = removeSubscription(tracker, "nonexistent");

      expect(getSubscriptions(updated)).toEqual([]);
    });
  });

  describe("clearSubscriptions", () => {
    it("should remove all subscriptions", () => {
      let tracker = createSubscriptionTracker();
      tracker = addSubscription(tracker, "group/abc/messages");
      tracker = addSubscription(tracker, "group/xyz/messages");

      const updated = clearSubscriptions(tracker);

      expect(getSubscriptions(updated)).toEqual([]);
    });
  });

  describe("immutability", () => {
    it("should not mutate original on add", () => {
      const original = createSubscriptionTracker();
      addSubscription(original, "group/abc/messages");

      expect(getSubscriptions(original)).toEqual([]);
    });

    it("should not mutate original on remove", () => {
      let tracker = createSubscriptionTracker();
      tracker = addSubscription(tracker, "group/abc/messages");
      removeSubscription(tracker, "group/abc/messages");

      expect(getSubscriptions(tracker)).toEqual(["group/abc/messages"]);
    });

    it("should not mutate original on clear", () => {
      let tracker = createSubscriptionTracker();
      tracker = addSubscription(tracker, "group/abc/messages");
      clearSubscriptions(tracker);

      expect(getSubscriptions(tracker)).toEqual(["group/abc/messages"]);
    });
  });
});
