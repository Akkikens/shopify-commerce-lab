import type { Config } from '@react-router/dev/config';

export default {
  ssr: true,
  subResourceIntegrity: false,
  future: {
    v8_middleware: true,
    unstable_optimizeDeps: true,
  },
} satisfies Config;
