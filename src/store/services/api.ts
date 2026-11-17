import { createApi } from "@reduxjs/toolkit/query/react";

import { axiosBaseQuery } from "@/lib/api/axiosBaseQuery";

export const api = createApi({
  reducerPath: "api",
  tagTypes: ["Presentations"],
  baseQuery: axiosBaseQuery,
  endpoints: () => ({}),
});
