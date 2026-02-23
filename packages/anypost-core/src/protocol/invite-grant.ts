import { ed25519 } from "@noble/curves/ed25519.js";
import { encode } from "cbor-x";
import { z } from "zod";
import type { AccountKey } from "../crypto/identity.js";
import { Result } from "../shared/result.js";

const Uint8ArraySchema = z.instanceof(Uint8Array);

const InviteGrantTargetedSchema = z.object({
  kind: z.literal("targeted-peer"),
  tokenId: z.string().uuid(),
  groupId: z.string().uuid(),
  issuedAt: z.number(),
  targetPeerId: z.string().min(1),
});

const InviteGrantOpenSchema = z.object({
  kind: z.literal("open"),
  tokenId: z.string().uuid(),
  groupId: z.string().uuid(),
  issuedAt: z.number(),
  expiresAt: z.number().optional(),
  maxJoiners: z.number().int().positive().optional(),
});

export const InviteGrantClaimsSchema = z.discriminatedUnion("kind", [
  InviteGrantTargetedSchema,
  InviteGrantOpenSchema,
]);

export type InviteGrantClaims = z.infer<typeof InviteGrantClaimsSchema>;

export type InviteGrantPolicy =
  | {
      readonly kind: "targeted-peer";
      readonly targetPeerId: string;
    }
  | {
      readonly kind: "open";
      readonly expiresAt?: number;
      readonly maxJoiners?: number;
    };

export const InviteGrantProofSchema = z.object({
  claims: InviteGrantClaimsSchema,
  issuerPublicKey: Uint8ArraySchema,
  signature: Uint8ArraySchema,
});

export type InviteGrantProof = z.infer<typeof InviteGrantProofSchema>;

const encodeGrantPayload = (
  claims: InviteGrantClaims,
  issuerPublicKey: Uint8Array,
): Uint8Array =>
  new Uint8Array(
    encode({
      claims,
      issuerPublicKey,
    }),
  );

type CreateInviteGrantOptions = {
  readonly accountKey: AccountKey;
  readonly groupId: string;
  readonly policy: InviteGrantPolicy;
  readonly issuedAt?: number;
  readonly tokenId?: string;
};

export const createInviteGrant = (
  options: CreateInviteGrantOptions,
): InviteGrantProof => {
  const tokenId = options.tokenId ?? crypto.randomUUID();
  const issuedAt = options.issuedAt ?? Date.now();

  const claims: InviteGrantClaims = options.policy.kind === "targeted-peer"
    ? {
        kind: "targeted-peer",
        tokenId,
        groupId: options.groupId,
        issuedAt,
        targetPeerId: options.policy.targetPeerId,
      }
    : {
        kind: "open",
        tokenId,
        groupId: options.groupId,
        issuedAt,
        ...(options.policy.expiresAt !== undefined
          ? { expiresAt: options.policy.expiresAt }
          : {}),
        ...(options.policy.maxJoiners !== undefined
          ? { maxJoiners: options.policy.maxJoiners }
          : {}),
      };

  const issuerPublicKey = new Uint8Array(options.accountKey.publicKey);
  const payload = encodeGrantPayload(claims, issuerPublicKey);
  const signature = new Uint8Array(ed25519.sign(payload, options.accountKey.privateKey));

  return {
    claims,
    issuerPublicKey,
    signature,
  };
};

type VerifyInviteGrantOptions = {
  readonly groupId?: string;
};

export const verifyInviteGrant = (
  proof: InviteGrantProof,
  options: VerifyInviteGrantOptions = {},
): Result<InviteGrantClaims, Error> => {
  const parsed = InviteGrantProofSchema.safeParse(proof);
  if (!parsed.success) {
    return Result.failure(new Error(`Invalid invite grant: ${parsed.error.message}`));
  }

  const payload = encodeGrantPayload(parsed.data.claims, parsed.data.issuerPublicKey);
  const valid = ed25519.verify(
    parsed.data.signature,
    payload,
    parsed.data.issuerPublicKey,
  );
  if (!valid) {
    return Result.failure(new Error("Invalid invite grant signature"));
  }

  if (options.groupId && parsed.data.claims.groupId !== options.groupId) {
    return Result.failure(new Error("Invite grant is for a different group"));
  }

  return Result.success(parsed.data.claims);
};

type ValidateInviteGrantJoinOptions = {
  readonly groupId: string;
  readonly requesterPeerId: string;
  readonly now?: number;
  readonly approvedCount?: number;
};

export const validateInviteGrantForJoin = (
  proof: InviteGrantProof,
  options: ValidateInviteGrantJoinOptions,
): Result<{ readonly tokenId: string }, Error> => {
  const verified = verifyInviteGrant(proof, { groupId: options.groupId });
  if (!verified.success) {
    return Result.failure(verified.error);
  }

  const claims = verified.data;
  const now = options.now ?? Date.now();

  if (claims.kind === "targeted-peer") {
    if (claims.targetPeerId !== options.requesterPeerId) {
      return Result.failure(new Error("Invite is targeted to a different peer"));
    }
    return Result.success({ tokenId: claims.tokenId });
  }

  if (claims.expiresAt !== undefined && now > claims.expiresAt) {
    return Result.failure(new Error("Invite has expired"));
  }

  if (
    claims.maxJoiners !== undefined &&
    options.approvedCount !== undefined &&
    options.approvedCount >= claims.maxJoiners
  ) {
    return Result.failure(new Error("Invite has reached its join limit"));
  }

  return Result.success({ tokenId: claims.tokenId });
};
