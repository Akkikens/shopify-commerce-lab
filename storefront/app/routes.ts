import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

// Optional market prefix: "/" (US) or "/en-ca", "/en-gb", ... (see lib/i18n.ts).
export default [
  ...prefix(':locale?', [index('routes/home.tsx'), route('products/:handle', 'routes/product.tsx')]),
  route('*', 'routes/not-found.tsx'),
] satisfies RouteConfig;
