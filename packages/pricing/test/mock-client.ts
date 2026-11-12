import type { AdminClient, GraphqlResponse } from '../src/client';

export interface RecordedCall {
  operation: string;
  variables: Record<string, unknown>;
}

type Handler = (variables: Record<string, unknown>, callIndex: number) => GraphqlResponse<unknown>;

/** Routes requests by GraphQL operation name to canned responses and records every call. */
export function mockAdminClient(handlers: Record<string, Handler>) {
  const calls: RecordedCall[] = [];
  const client: AdminClient = {
    async request(query, maybeVariables) {
      const variables = (maybeVariables ?? {}) as Record<string, unknown>;
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'anonymous';
      const handler = handlers[operation];
      if (!handler) throw new Error(`No mock for ${operation}`);
      const index = calls.filter((c) => c.operation === operation).length;
      calls.push({ operation, variables });
      return handler(variables, index) as never;
    },
  };
  return { client, calls };
}
