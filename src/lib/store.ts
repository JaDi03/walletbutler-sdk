// In-memory store for webhook statuses (Useful for dev/demo without a DB)

const globalForStore = global as unknown as { webhookStore: Map<string, string> };

export const webhookStore = globalForStore.webhookStore || new Map<string, string>();

if (process.env.NODE_ENV !== "production") {
  globalForStore.webhookStore = webhookStore;
}
