import { preview } from "vite";

let server;
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await server?.close();
  } finally {
    process.exitCode = exitCode;
    if (process.connected) process.disconnect();
  }
}

try {
  server = await preview({
    preview: {
      host: "127.0.0.1",
      port: 0,
      strictPort: true,
    },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === "string" || !Number.isInteger(address.port) || address.port <= 0) {
    throw new Error("Owned Vite preview did not publish a TCP port.");
  }
  process.send?.({ type: "owned-preview-ready", port: address.port });
  process.on("message", (message) => {
    if (message?.type === "shutdown") void shutdown();
  });
  process.on("disconnect", () => { void shutdown(); });
  process.on("SIGTERM", () => { void shutdown(); });
} catch (error) {
  process.send?.({ type: "owned-preview-error", message: error instanceof Error ? error.message : String(error) });
  await shutdown(1);
}
