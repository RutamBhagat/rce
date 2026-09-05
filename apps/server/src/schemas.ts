import { z } from "zod";

export const authorizationParams = z.object({
  client_id: z.string(),
  redirect_uri: z.string(),
});
