import { api } from "@/store/services/api";

export interface HealthResponse { status: "ok" }
export const healthApi = api.injectEndpoints({
  endpoints: (build) => ({
    getHealth: build.query<HealthResponse, void>({
      query: () => ({ url: "/health", authenticated: false }),
    }),
  }),
});
export const { useGetHealthQuery } = healthApi;
