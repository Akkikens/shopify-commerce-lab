/**
 * Minimal Admin GraphQL client contract. It matches the shape of `admin.graphql`
 * from @shopify/shopify-app-react-router closely enough that app routes can pass
 * an adapter, while tests pass a mock and scripts use createAdminFetchClient.
 */
export interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export interface AdminClient {
  request<TData, TVariables extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    variables?: TVariables,
  ): Promise<GraphqlResponse<TData>>;
}

export interface UserError {
  field?: string[] | null;
  code?: string | null;
  message: string;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly details: unknown,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

export class UserErrorsError extends AdminApiError {
  constructor(
    readonly operation: string,
    readonly userErrors: UserError[],
  ) {
    super(`${operation} returned ${userErrors.length} user error(s): ${userErrors.map((e) => e.message).join('; ')}`, userErrors);
    this.name = 'UserErrorsError';
  }
}

/** Throw on top-level GraphQL errors or missing data; return data otherwise. */
export async function execute<TData, TVariables extends Record<string, unknown>>(
  client: AdminClient,
  query: string,
  variables: TVariables,
): Promise<TData> {
  const response = await client.request<TData, TVariables>(query, variables);
  if (response.errors?.length) {
    throw new AdminApiError(response.errors.map((e) => e.message).join('; '), response.errors);
  }
  if (!response.data) throw new AdminApiError('Admin API response had no data', response);
  return response.data;
}

export interface AdminFetchClientOptions {
  /** e.g. my-dev-store.myshopify.com */
  shop: string;
  accessToken: string;
  apiVersion?: string;
  fetch?: typeof fetch;
}

/** Plain-fetch client for scripts and Lambdas (no app framework needed). */
export function createAdminFetchClient({
  shop,
  accessToken,
  apiVersion = '2026-10',
  fetch: fetchImpl = fetch,
}: AdminFetchClientOptions): AdminClient {
  const url = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
  return {
    async request(query, variables) {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shopify-access-token': accessToken },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new AdminApiError(`Admin API HTTP ${res.status}`, await res.text());
      return res.json();
    },
  };
}
