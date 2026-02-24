import { Result } from "../shared/result.js";
import { toHex, GENESIS_HASH } from "./action-chain.js";
import type { SignedActionEnvelope } from "./action-chain.js";
import { verifyAndDecodeAction } from "./action-signing.js";
import {
  verifyInviteGrant,
  type InviteGrantProof,
} from "./invite-grant.js";
import { encode as cborEncode, decode as cborDecode } from "cbor-x";
import { sha256 } from "@noble/hashes/sha2.js";

export type GroupInvite = {
  readonly genesisEnvelope: SignedActionEnvelope;
  readonly relayAddr?: string;
  readonly adminPeerId: string;
  readonly inviteGrant?: InviteGrantProof;
};

type SerializedInvite = {
  readonly v: 2;
  readonly sb: Uint8Array;
  readonly sg: Uint8Array;
  readonly a: string;
  readonly r?: string;
  readonly g?: {
    readonly c: InviteGrantProof["claims"];
    readonly p: Uint8Array;
    readonly s: Uint8Array;
  };
};

const GENESIS_HASH_HEX = toHex(GENESIS_HASH);

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const base64UrlToBytes = (code: string): Uint8Array => {
  const base64 = code
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(code.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const cloneBytes = (input: Uint8Array): Uint8Array<ArrayBuffer> => {
  const copy = new Uint8Array(new ArrayBuffer(input.length));
  copy.set(input);
  return copy;
};

const asUint8Array = (value: unknown): Uint8Array<ArrayBuffer> | null => {
  if (value instanceof Uint8Array) return cloneBytes(value);
  if (value instanceof ArrayBuffer) return cloneBytes(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) {
    return cloneBytes(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  return null;
};

export const encodeGroupInvite = (invite: GroupInvite): string => {
  const serialized: SerializedInvite = {
    v: 2,
    sb: invite.genesisEnvelope.signedBytes,
    sg: invite.genesisEnvelope.signature,
    r: invite.relayAddr?.trim() || undefined,
    a: invite.adminPeerId,
    g: invite.inviteGrant
      ? {
          c: invite.inviteGrant.claims,
          p: invite.inviteGrant.issuerPublicKey,
          s: invite.inviteGrant.signature,
        }
      : undefined,
  };

  return bytesToBase64Url(new Uint8Array(cborEncode(serialized)));
};

export const decodeGroupInvite = (code: string): Result<GroupInvite, Error> => {
  try {
    const bytes = base64UrlToBytes(code);
    const parsed: unknown = cborDecode(bytes);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("v" in parsed) ||
      !("sb" in parsed) ||
      !("sg" in parsed) ||
      !("a" in parsed)
    ) {
      return Result.failure(new Error("Invalid invite format"));
    }

    const {
      v,
      sb,
      sg,
      r,
      a,
      g,
    } = parsed as SerializedInvite;

    if (v !== 2) {
      return Result.failure(new Error("Invalid invite format"));
    }
    const signedBytes = asUint8Array(sb);
    const signature = asUint8Array(sg);
    if (!signedBytes || !signature || signedBytes.length === 0 || signature.length === 0) {
      return Result.failure(new Error("Invalid invite format"));
    }
    if (typeof a !== "string" || a.trim().length === 0) {
      return Result.failure(new Error("Invalid invite format"));
    }
    if (r !== undefined && typeof r !== "string") {
      return Result.failure(new Error("Invalid invite format"));
    }

    const envelope: SignedActionEnvelope = {
      signedBytes,
      signature,
      hash: cloneBytes(new Uint8Array(sha256(signedBytes))),
    };

    const verifyResult = verifyAndDecodeAction(envelope);
    if (!verifyResult.success) {
      return Result.failure(verifyResult.error);
    }

    const action = verifyResult.data;

    if (action.payload.type !== "group-created" && action.payload.type !== "dm-created") {
      return Result.failure(
        new Error("Invite must contain a group-created or dm-created action"),
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
    if (g !== undefined) {
      if (typeof g !== "object" || g === null || !("c" in g) || !("p" in g) || !("s" in g)) {
        return Result.failure(new Error("Invalid invite format"));
      }
      const grantData = g as NonNullable<SerializedInvite["g"]>;
      const issuerPublicKey = asUint8Array(grantData.p);
      const grantSignature = asUint8Array(grantData.s);
      if (!issuerPublicKey || !grantSignature) {
        return Result.failure(new Error("Invalid invite format"));
      }
      inviteGrant = {
        claims: grantData.c,
        issuerPublicKey,
        signature: grantSignature,
      };
      const grantResult = verifyInviteGrant(inviteGrant, { groupId: action.groupId });
      if (!grantResult.success) {
        return Result.failure(grantResult.error);
      }
    }

    return Result.success({
      genesisEnvelope: envelope,
      relayAddr: r?.trim() ? r.trim() : undefined,
      adminPeerId: a,
      inviteGrant,
    });
  } catch (error) {
    return Result.failure(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
};
