import { createSignal, For, Show } from "solid-js";
import type { GroupMember } from "anypost-core/protocol";

export type PendingJoinRequest = {
  readonly publicKeyHex: string;
  readonly publicKey: Uint8Array;
};

type GroupInfoPanelProps = {
  readonly groupId: string | null;
  readonly groupName: string;
  readonly members: ReadonlyMap<string, GroupMember>;
  readonly pendingJoins: readonly PendingJoinRequest[];
  readonly isAdmin: boolean;
  readonly ownPublicKeyHex: string;
  readonly ownDisplayName: string;
  readonly publicKeyToPeerId: ReadonlyMap<string, string>;
  readonly connectedPeerIds: ReadonlySet<string>;
  readonly latencyMap: ReadonlyMap<string, number>;
  readonly onApproveJoin: (memberPublicKey: Uint8Array) => void;
  readonly onRemoveMember: (memberPublicKey: Uint8Array) => void;
  readonly onAddByPeerId: (peerId: string) => string | null;
  readonly onCreateInvite: (() => void) | null;
};

const truncatePeerId = (peerId: string): string =>
  peerId.length > 20 ? `${peerId.slice(0, 12)}...${peerId.slice(-6)}` : peerId;

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
  const [copiedGroupId, setCopiedGroupId] = createSignal(false);
  const [copiedInvite, setCopiedInvite] = createSignal(false);
  const [addPeerIdInput, setAddPeerIdInput] = createSignal("");
  const [addPeerIdError, setAddPeerIdError] = createSignal("");

  const copyGroupId = () => {
    if (!props.groupId) return;
    navigator.clipboard.writeText(props.groupId).then(() => {
      setCopiedGroupId(true);
      setTimeout(() => setCopiedGroupId(false), 2000);
    }).catch(() => {});
  };

  const handleCopyInvite = () => {
    props.onCreateInvite?.();
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleAddByPeerId = () => {
    const peerId = addPeerIdInput().trim();
    if (!peerId) return;

    setAddPeerIdError("");
    const error = props.onAddByPeerId(peerId);
    if (error) {
      setAddPeerIdError(error);
      return;
    }
    setAddPeerIdInput("");
  };

  return (
    <div class="space-y-4">
      <div>
        <h3 class="text-lg font-semibold text-tg-text">{props.groupName}</h3>
      </div>

      <Show when={props.groupId}>
        <button
          class="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded hover:bg-tg-hover cursor-pointer"
          onClick={copyGroupId}
        >
          <span class="text-xs text-tg-text-dim shrink-0">Group ID</span>
          <span class="font-mono text-xs text-tg-text truncate">{props.groupId}</span>
          <span class="text-tg-accent text-[10px] shrink-0 ml-auto">
            {copiedGroupId() ? "Copied!" : "Copy"}
          </span>
        </button>
      </Show>

      <Show when={props.onCreateInvite !== null}>
        <button
          class="w-full py-2 px-3 rounded-lg bg-tg-accent text-white text-sm hover:bg-tg-accent/80 cursor-pointer"
          onClick={handleCopyInvite}
        >
          {copiedInvite() ? "Invite copied!" : "Copy Invite Code"}
        </button>
      </Show>

      <div>
        <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
          Members ({props.members.size})
        </h4>
        <div class="space-y-1">
          <For each={memberEntries()}>
            {(member) => {
              const isOwn = () => member.publicKeyHex === props.ownPublicKeyHex;
              const peerId = () => props.publicKeyToPeerId.get(member.publicKeyHex);
              const memberLabel = () => {
                if (isOwn() && props.ownDisplayName) return props.ownDisplayName;
                const pid = peerId();
                if (pid) return truncatePeerId(pid);
                return truncateHex(member.publicKeyHex);
              };
              const isConnected = () => {
                const pid = peerId();
                return pid ? props.connectedPeerIds.has(pid) : false;
              };
              const latency = () => {
                const pid = peerId();
                return pid ? props.latencyMap.get(pid) : undefined;
              };
              const canRemove = () => props.isAdmin && !isOwn() && member.role !== "admin";

              return (
                <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-tg-hover">
                  <div class="flex items-center gap-2 min-w-0">
                    <Show when={!isOwn()}>
                      <span
                        class="w-2 h-2 rounded-full shrink-0"
                        classList={{
                          "bg-green-500": isConnected(),
                          "bg-gray-500": !isConnected(),
                        }}
                      />
                    </Show>
                    <span
                      class="text-sm text-tg-text truncate"
                      classList={{ "font-mono": !isOwn() || !props.ownDisplayName }}
                    >
                      {memberLabel()}
                    </span>
                    <Show when={isOwn()}>
                      <span class="text-[10px] text-tg-accent font-medium">(You)</span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <Show when={!isOwn() && latency() !== undefined}>
                      <span class="text-[10px] text-tg-text-dim">{latency()}ms</span>
                    </Show>
                    <RoleBadge role={member.role} />
                    <Show when={canRemove()}>
                      <button
                        class="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-400/10 cursor-pointer"
                        onClick={() => props.onRemoveMember(member.publicKey)}
                      >
                        Remove
                      </button>
                    </Show>
                  </div>
                </div>
              );
            }}
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
              {(request) => {
                const requestLabel = () => {
                  const peerId = props.publicKeyToPeerId.get(request.publicKeyHex);
                  if (peerId) return truncatePeerId(peerId);
                  return truncateHex(request.publicKeyHex);
                };

                return (
                  <div class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-tg-hover">
                    <span class="font-mono text-sm text-tg-text truncate">
                      {requestLabel()}
                    </span>
                    <button
                      class="text-xs bg-tg-accent text-white px-2.5 py-1 rounded hover:bg-tg-accent/80 cursor-pointer"
                      onClick={() => props.onApproveJoin(request.publicKey)}
                    >
                      Approve
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.isAdmin}>
        <div>
          <h4 class="text-xs font-medium text-tg-text-dim uppercase tracking-wider mb-2">
            Add Member by Peer ID
          </h4>
          <div class="flex gap-2">
            <input
              type="text"
              class="flex-1 bg-tg-input text-tg-text text-xs font-mono px-2.5 py-1.5 rounded border border-tg-border focus:border-tg-accent focus:outline-none"
              placeholder="12D3KooW..."
              value={addPeerIdInput()}
              onInput={(e) => {
                setAddPeerIdInput(e.currentTarget.value);
                setAddPeerIdError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddByPeerId();
              }}
            />
            <button
              class="text-xs bg-tg-accent text-white px-3 py-1.5 rounded hover:bg-tg-accent/80 cursor-pointer disabled:opacity-50"
              disabled={!addPeerIdInput().trim()}
              onClick={handleAddByPeerId}
            >
              Add
            </button>
          </div>
          <Show when={addPeerIdError()}>
            <p class="text-[10px] text-red-400 mt-1">{addPeerIdError()}</p>
          </Show>
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
