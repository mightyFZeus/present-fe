import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker(({ mode, isPreview }) => {
    const production = mode === "production" && !isPreview;

    return {
      name: "present-fe",
      entrypoint: "vinext/server/fetch-handler",
      compatibilityDate: "2026-11-17",
      assets: {
        htmlHandling: "none",
        notFoundHandling: "none",
        runWorkerFirst: [
          "/*",
          "!/_next/static/*",
          "!/*/_next/static/*",
        ],
      },
      observability: production ? { logs: { enabled: true } } : undefined,
      env: {
        ASSETS: bindings.assets(),
        NEXT_PUBLIC_API_BASE_URL: production
          ? bindings.text("https://api.prezntly.xyz")
          : undefined,
      },
    };
  }),
});
