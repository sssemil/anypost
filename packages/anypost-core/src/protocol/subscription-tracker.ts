type SubscriptionTracker = {
  readonly topics: readonly string[];
};

export const createSubscriptionTracker = (): SubscriptionTracker => ({
  topics: [],
});

export const addSubscription = (
  tracker: SubscriptionTracker,
  topic: string,
): SubscriptionTracker => {
  if (tracker.topics.includes(topic)) return tracker;
  return { ...tracker, topics: [...tracker.topics, topic] };
};

export const removeSubscription = (
  tracker: SubscriptionTracker,
  topic: string,
): SubscriptionTracker => ({
  ...tracker,
  topics: tracker.topics.filter((t) => t !== topic),
});

export const clearSubscriptions = (
  tracker: SubscriptionTracker,
): SubscriptionTracker => ({
  ...tracker,
  topics: [],
});

export const getSubscriptions = (
  tracker: SubscriptionTracker,
): readonly string[] => tracker.topics;
