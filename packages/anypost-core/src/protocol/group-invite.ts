import { Result } from "../shared/result.js";
import { toHex, GENESIS_HASH } from "./action-chain.js";
import type { SignedActionEnvelope } from "./action-chain.js";
import { verifyAndDecodeAction } from "./action-signing.js";
import {
  verifyInviteGrant,
  type InviteGrantProof,
} from "./invite-grant.js";

export type GroupInvite = {
  readonly genesisEnvelope: SignedActionEnvelope;
  readonly relayAddr: string;
  readonly adminPeerId: string;
  readonly inviteGrant?: InviteGrantProof;
};

type SerializedInvite = {
  readonly signedBytes: string;
  readonly signature: string;
  readonly hash: string;
  readonly relayAddr: string;
  readonly adminPeerId: string;
  readonly inviteGrant?: {
    readonly claims: InviteGrantProof["claims"];
    readonly issuerPublicKey: string;
    readonly signature: string;
  };
};

const GENESIS_HASH_HEX = toHex(GENESIS_HASH);

export const encodeGroupInvite = (invite: GroupInvite): string => {
  const serialized: SerializedInvite = {
    signedBytes: toHex(invite.genesisEnvelope.signedBytes),
    signature: toHex(invite.genesisEnvelope.signature),
    hash: toHex(invite.genesisEnvelope.hash),
    relayAddr: invite.relayAddr,
    adminPeerId: invite.adminPeerId,
    inviteGrant: invite.inviteGrant
      ? {
          claims: invite.inviteGrant.claims,
          issuerPublicKey: toHex(invite.inviteGrant.issuerPublicKey),
          signature: toHex(invite.inviteGrant.signature),
        }
      : undefined,
  };

  const json = JSON.stringify(serialized);
  return btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

export const decodeGroupInvite = (code: string): Result<GroupInvite, Error> => {
  try {
    const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const parsed: unknown = JSON.parse(json);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("signedBytes" in parsed) ||
      !("signature" in parsed) ||
      !("hash" in parsed) ||
      !("relayAddr" in parsed) ||
      !("adminPeerId" in parsed)
    ) {
      return Result.failure(new Error("Invalid invite format"));
    }

    const {
      signedBytes,
      signature,
      hash,
      relayAddr,
      adminPeerId,
      inviteGrant: serializedInviteGrant,
    } = parsed as SerializedInvite;

    const envelope: SignedActionEnvelope = {
      signedBytes: hexToBytes(signedBytes),
      signature: hexToBytes(signature),
      hash: hexToBytes(hash),
    };

    const verifyResult = verifyAndDecodeAction(envelope);
    if (!verifyResult.success) {
      return Result.failure(verifyResult.error);
    }

    const action = verifyResult.data;

    if (action.payload.type !== "group-created") {
      return Result.failure(
        new Error("Invite must contain a group-created action"),
      );
    }

    const hasOnlyGenesisParent =
      action.parentHashes.length === 1 &&
      toHex(action.parentHashes[0]) === GENESIS_HASH_HEX;

    if (!hasOnlyGenesisParent) {
      return Result.failure(
        new Error("Invite must contain a genesis action (single genesis parent hash)"),
      );
    }

    let inviteGrant: InviteGrantProof | undefined;
    if (serializedInviteGrant !== undefined) {
      inviteGrant = {
        claims: serializedInviteGrant.claims,
        issuerPublicKey: hexToBytes(serializedInviteGrant.issuerPublicKey),
        signature: hexToBytes(serializedInviteGrant.signature),
      };
      const grantResult = verifyInviteGrant(inviteGrant, { groupId: action.groupId });
      if (!grantResult.success) {
        return Result.failure(grantResult.error);
      }
    }

    return Result.success({
      genesisEnvelope: envelope,
      relayAddr: relayAddr as string,
      adminPeerId,
      inviteGrant,
    });
  } catch (error) {
    return Result.failure(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
};
