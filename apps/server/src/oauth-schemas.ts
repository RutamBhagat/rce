import { getSchemaValidator, t } from "elysia";

export const authorizationParams = getSchemaValidator(t.Object({
  client_id: t.String(),
  redirect_uri: t.String(),
}));
