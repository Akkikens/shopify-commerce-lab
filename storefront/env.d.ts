/// <reference types="vite/client" />
/// <reference types="react-router" />

/** Oxygen / MiniOxygen bindings. Values come from .env locally and Oxygen env vars when deployed. */
interface Env {
  PUBLIC_STORE_DOMAIN?: string;
  PUBLIC_STOREFRONT_API_TOKEN?: string;
  PUBLIC_STOREFRONT_ID?: string;
}
