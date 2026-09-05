import { z } from "zod";

export const authorizationParams = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
  response_type: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  resource: z.string().optional(),
});
