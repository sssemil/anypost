import { For, Show } from "solid-js";
import type { GroupMember } from "anypost-core/protocol";

export type PendingJoinRequest = {
  readonly publicKeyHex: string;
  readonly publicKey: Uint8Array;
};

type GroupInfoPanelProps = {
  readonly groupName: string;
  readonly members: ReadonlyMap<string, GroupMember>;
  readonly pendingJoins: readonly PendingJoinRequest[];
  readonly isAdmin: boolean;
  readonly ownPublicKeyHex: string;
  readonly onApproveJoin: (memberPublicKey: Uint8Array) => void;
};

const truncateHex = (hex: string): string =>
  hex.length > 16 ? `${hex.slice(0, 8)}...${hex.slice(-8)}` : hex;

const RoleBadge = (props: { readonly role: "admin" | "member" }) => (
  <span
    class="text-[10px] font-medium px-1.5 py-0.5 rounded"
    classList={{
      "bg-tg-accent/20 text-tg-accent": props.role === "admin",
      "bg-tg-text-dim/20 text-tg-text-dim": props.role === "member",
    }}
  >
    {props.role === "admin" ? "Admin" : "Member"}
  </span>
);

export const GroupInfoPanel = (props: GroupInfoPanelProps) => {
  const memberEntries = () => [...props.members.values()];

  return (
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-tg-text">{props.groupName}</h3>
      </div>

      <div>
        <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
          Members ({props.members.size})
        </h4>
        <div class="space-y-1">
          <For each={memberEntries()}>
            {(member) => (
              <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-tg-hover">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-mono text-sm text-tg-text truncate">
                    {truncateHex(member.publicKeyHex)}
                  </span>
                  <Show when={member.publicKeyHex === props.ownPublicKeyHex}>
                    <span class="text-[10px] text-tg-accent font-medium">(You)</span>
                  </Show>
                </div>
                <RoleBadge role={member.role} />
              </div>
            )}
          </For>
        </div>
      </div>

      <Show when={props.isAdmin && props.pendingJoins.length > 0}>
        <div>
          <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
            Pending Requests ({props.pendingJoins.length})
          </h4>
          <div class="space-y-1">
            <For each={props.pendingJoins}>
              {(request) => (
                <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-tg-hover">
                  <span class="font-mono text-sm text-tg-text truncate">
                    {truncateHex(request.publicKeyHex)}
                  </span>
                  <button
                    class="text-xs bg-tg-accent text-white px-2.5 py-1 rounded hover:bg-tg-accent/80 cursor-pointer"
                    onClick={() => props.onApproveJoin(request.publicKey)}
                  >
                    Approve
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.members.size === 0}>
        <p class="text-sm text-tg-text-dim">
          No action chain for this group. Member info is limited.
        </p>
      </Show>
    </div>
  );
};
