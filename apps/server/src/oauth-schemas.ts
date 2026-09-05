import { t } from "elysia";

export const consentQuery = t.Object({
  client_id: t.String(),
  redirect_uri: t.String(),
}, { additionalProperties: true });

export const consentBody = t.Object({
  oauth_query: t.String({ minLength: 1 }),
}, { additionalProperties: false });
