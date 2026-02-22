import type { AccountKey } from "anypost-core/crypto";

export type OnboardingState =
  | { readonly status: "checking" }
  | { readonly status: "no-account" }
  | {
      readonly status: "display-name-prompt";
      readonly accountKey: AccountKey;
    }
  | {
      readonly status: "ready";
      readonly accountKey: AccountKey;
      readonly backupPending: boolean;
    };

export type OnboardingEvent =
  | { readonly type: "no-key-found" }
  | {
      readonly type: "key-found";
      readonly accountKey: AccountKey;
      readonly backedUp: boolean;
    }
  | {
      readonly type: "key-generated";
      readonly accountKey: AccountKey;
    }
  | {
      readonly type: "key-imported";
      readonly accountKey: AccountKey;
    }
  | {
      readonly type: "display-name-set";
      readonly displayName: string;
    }
  | { readonly type: "backup-completed" };

export const createInitialState = (): OnboardingState => ({
  status: "checking",
});

export const transition = (
  state: OnboardingState,
  event: OnboardingEvent,
): OnboardingState => {
  switch (state.status) {
    case "checking":
      if (event.type === "no-key-found") {
        return { status: "no-account" };
      }
      if (event.type === "key-found") {
        return {
          status: "ready",
          accountKey: event.accountKey,
          backupPending: !event.backedUp,
        };
      }
      return state;

    case "no-account":
      if (event.type === "key-generated" || event.type === "key-imported") {
        return {
          status: "display-name-prompt",
          accountKey: event.accountKey,
        };
      }
      return state;

    case "display-name-prompt":
      if (event.type === "display-name-set") {
        return {
          status: "ready",
          accountKey: state.accountKey,
          backupPending: true,
        };
      }
      return state;

    case "ready":
      if (event.type === "backup-completed") {
        return {
          ...state,
          backupPending: false,
        };
      }
      return state;
  }
};
