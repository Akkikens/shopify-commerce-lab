import type { AdminClient } from "@commerce-lab/pricing";

type AppAdmin = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/** Adapt the embedded app's authenticated `admin.graphql` to the pricing package's client contract. */
export function toAdminClient(admin: AppAdmin): AdminClient {
  return {
    async request(query, variables) {
      const response = await admin.graphql(query, { variables });
      return response.json();
    },
  };
}
