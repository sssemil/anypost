import { createSignal, For, Show } from "solid-js";
import {
  createSidebarState,
  transitionSidebar,
  isValidGroupIdInput,
} from "./sidebar-machine.js";

type GroupItem = {
  readonly groupId: string;
  readonly unreadCount: number;
};

type GroupSidebarProps = {
  readonly groups: readonly GroupItem[];
  readonly activeGroupId: string | null;
  readonly onSelectGroup: (groupId: string) => void;
  readonly onJoinGroup: (groupId: string) => void;
  readonly onCreateGroup: () => void;
  readonly onLeaveGroup: (groupId: string) => void;
};

export const GroupSidebar = (props: GroupSidebarProps) => {
  const [state, setState] = createSignal(createSidebarState());

  const dispatch = (event: Parameters<typeof transitionSidebar>[1]) => {
    setState((s) => transitionSidebar(s, event));
  };

  const handleJoinSubmit = () => {
    const input = state().joinInput.trim();
    if (!isValidGroupIdInput(input)) {
      dispatch({ type: "join-failed", error: "Enter a valid UUID" });
      return;
    }
    props.onJoinGroup(input);
    dispatch({ type: "join-succeeded" });
  };

  const handleJoinKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleJoinSubmit();
    }
    if (e.key === "Escape") {
      dispatch({ type: "join-form-closed" });
    }
  };

  return (
    <div style={{
      display: "flex",
      "flex-direction": "column",
      height: "100%",
      "background-color": "#f5f5f5",
      "border-right": "1px solid #e0e0e0",
      width: "220px",
      "min-width": "220px",
    }}>
      <div style={{
        padding: "12px",
        "border-bottom": "1px solid #e0e0e0",
        display: "flex",
        gap: "6px",
      }}>
        <button
          onClick={() => dispatch({ type: "join-form-opened" })}
          style={{
            flex: 1,
            padding: "6px 10px",
            "border-radius": "4px",
            border: "1px solid #ccc",
            cursor: "pointer",
            "font-size": "0.85em",
            "background-color": "#fff",
          }}
        >
          Join
        </button>
        <button
          onClick={props.onCreateGroup}
          style={{
            flex: 1,
            padding: "6px 10px",
            "border-radius": "4px",
            border: "none",
            cursor: "pointer",
            "font-size": "0.85em",
            "background-color": "#2196F3",
            color: "white",
          }}
        >
          Create
        </button>
      </div>

      <Show when={state().isJoinFormOpen}>
        <div style={{
          padding: "10px 12px",
          "border-bottom": "1px solid #e0e0e0",
          "background-color": "#fff",
        }}>
          <input
            type="text"
            value={state().joinInput}
            onInput={(e) => dispatch({ type: "join-input-changed", value: e.currentTarget.value })}
            onKeyDown={handleJoinKeyDown}
            placeholder="Paste group UUID..."
            autofocus
            style={{
              width: "100%",
              padding: "6px 8px",
              "border-radius": "4px",
              border: "1px solid #ccc",
              "font-family": "monospace",
              "font-size": "0.8em",
              "box-sizing": "border-box",
              "margin-bottom": "6px",
            }}
          />
          <Show when={state().joinError}>
            <div style={{ color: "#f44336", "font-size": "0.78em", "margin-bottom": "6px" }}>
              {state().joinError}
            </div>
          </Show>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={handleJoinSubmit}
              disabled={!state().joinInput.trim()}
              style={{
                flex: 1,
                padding: "4px 8px",
                "border-radius": "4px",
                border: "none",
                cursor: "pointer",
                "font-size": "0.82em",
                "background-color": "#4caf50",
                color: "white",
              }}
            >
              Join
            </button>
            <button
              onClick={() => dispatch({ type: "join-form-closed" })}
              style={{
                padding: "4px 8px",
                "border-radius": "4px",
                border: "1px solid #ccc",
                cursor: "pointer",
                "font-size": "0.82em",
                "background-color": "#fff",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      <div style={{ flex: 1, "overflow-y": "auto", padding: "4px 0" }}>
        <For each={props.groups} fallback={
          <div style={{ padding: "20px 12px", "text-align": "center", color: "#999", "font-size": "0.85em" }}>
            No groups joined yet
          </div>
        }>
          {(group) => {
            const [hovered, setHovered] = createSignal(false);
            const [copied, setCopied] = createSignal(false);
            const isActive = () => props.activeGroupId === group.groupId;

            const copyGroupId = (e: MouseEvent) => {
              e.stopPropagation();
              navigator.clipboard.writeText(group.groupId).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }).catch(() => {});
            };

            return (
              <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={() => props.onSelectGroup(group.groupId)}
                style={{
                  display: "flex",
                  "align-items": "center",
                  padding: "8px 12px",
                  cursor: "pointer",
                  "background-color": isActive() ? "#e3f2fd" : hovered() ? "#eee" : "transparent",
                  "border-left": isActive() ? "3px solid #2196F3" : "3px solid transparent",
                }}
              >
                <span style={{
                  flex: 1,
                  "font-family": "monospace",
                  "font-size": "0.8em",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "white-space": "nowrap",
                  color: isActive() ? "#1565c0" : "#333",
                }}>
                  {group.groupId.slice(0, 8)}...
                </span>

                <Show when={group.unreadCount > 0}>
                  <span style={{
                    "min-width": "18px",
                    height: "18px",
                    "border-radius": "9px",
                    "background-color": "#2196F3",
                    color: "white",
                    "font-size": "0.7em",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    "margin-right": "4px",
                    padding: "0 4px",
                  }}>
                    {group.unreadCount}
                  </span>
                </Show>

                <Show when={hovered()}>
                  <button
                    onClick={copyGroupId}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: copied() ? "#4caf50" : "#999",
                      "font-size": "0.75em",
                      padding: "0 3px",
                      "line-height": "1",
                    }}
                    title="Copy group ID"
                  >
                    {copied() ? "ok" : "cp"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onLeaveGroup(group.groupId);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "#999",
                      "font-size": "0.9em",
                      padding: "0 2px",
                      "line-height": "1",
                    }}
                    title="Leave group"
                  >
                    x
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
};
