export type SidebarState = {
  readonly isJoinFormOpen: boolean;
  readonly joinInput: string;
  readonly joinError: string | null;
};

export type SidebarEvent =
  | { readonly type: "join-form-opened" }
  | { readonly type: "join-form-closed" }
  | { readonly type: "join-input-changed"; readonly value: string }
  | { readonly type: "join-failed"; readonly error: string }
  | { readonly type: "join-succeeded" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createSidebarState = (): SidebarState => ({
  isJoinFormOpen: false,
  joinInput: "",
  joinError: null,
});

export const transitionSidebar = (
  state: SidebarState,
  event: SidebarEvent,
): SidebarState => {
  switch (event.type) {
    case "join-form-opened":
      return { ...state, isJoinFormOpen: true };
    case "join-form-closed":
      return { ...state, isJoinFormOpen: false, joinInput: "", joinError: null };
    case "join-input-changed":
      return { ...state, joinInput: event.value, joinError: null };
    case "join-failed":
      return { ...state, joinError: event.error };
    case "join-succeeded":
      return { ...state, isJoinFormOpen: false, joinInput: "", joinError: null };
  }
};

export const isValidGroupIdInput = (input: string): boolean =>
  UUID_PATTERN.test(input);
