import { z } from "zod";
import { GroupIdSchema } from "../shared/schemas.js";
import type { GroupId } from "../shared/schemas.js";
import { Result } from "../shared/result.js";

const INVITE_FRAGMENT_PREFIX = "#/invite?";

const InvitePayloadSchema = z.object({
  groupId: GroupIdSchema,
  inviterAddrs: z.array(z.string().min(1)).min(1),
  psk: z.string().min(1).optional(),
});

export type InvitePayload = z.infer<typeof InvitePayloadSchema>;

type CreateInviteLinkOptions = {
  readonly baseUrl: string;
  readonly groupId: GroupId;
  readonly inviterAddrs: readonly string[];
  readonly psk?: string;
};

export const createInviteLink = (options: CreateInviteLinkOptions): string => {
  const params = new URLSearchParams();
  params.set("groupId", options.groupId);
  for (const addr of options.inviterAddrs) {
    params.append("addr", addr);
  }
  if (options.psk !== undefined) {
    params.set("psk", options.psk);
  }
  return `${options.baseUrl}${INVITE_FRAGMENT_PREFIX}${params.toString()}`;
};

export const parseInviteLink = (
  url: string,
): Result<InvitePayload, Error> => {
  const fragmentIndex = url.indexOf(INVITE_FRAGMENT_PREFIX);
  if (fragmentIndex === -1) {
    return Result.failure(new Error("Not a valid invite link"));
  }

  const queryString = url.substring(
    fragmentIndex + INVITE_FRAGMENT_PREFIX.length,
  );
  const params = new URLSearchParams(queryString);

  const groupId = params.get("groupId");
  const inviterAddrs = params.getAll("addr");
  const psk = params.get("psk") ?? undefined;

  const parsed = InvitePayloadSchema.safeParse({
    groupId,
    inviterAddrs,
    psk,
  });

  if (!parsed.success) {
    return Result.failure(
      new Error(`Invalid invite link: ${parsed.error.message}`),
    );
  }

  return Result.success(parsed.data);
};
