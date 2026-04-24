import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclipai.mock-object-provider",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Mock Object Provider",
  description: "Reference external object provider for non-GitHub URL detection and status resolution.",
  author: "Paperclip",
  categories: ["connector"],
  capabilities: [
    "external.objects.detect",
    "external.objects.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  objectReferences: [
    {
      providerKey: "mocktracker",
      displayName: "Mock Tracker",
      objectTypes: ["ticket"],
      urlPatterns: ["https://mock.example/tickets/:id"],
      refreshPolicy: {
        defaultTtlSeconds: 300,
        staleAfterSeconds: 1800,
      },
    },
  ],
};

export default manifest;
