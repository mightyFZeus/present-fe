import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import type { ApiError, AxiosQueryArgs, RequestMeta } from "./apiTypes";
import { request } from "./request";
import { invalidResponse, unwrapData } from "./responseHelpers";

export const axiosBaseQuery: BaseQueryFn<
  AxiosQueryArgs, unknown, ApiError, object, RequestMeta
> = async (args, context) => {
  const result = await request(args, context);
  if (result.error) return result;
  if (args.expectNoContent) {
    return result.meta.status === 204
      ? { data: null, meta: result.meta }
      : { error: invalidResponse(), meta: result.meta };
  }
  const data = unwrapData(result.data);
  if (data === undefined) return { error: invalidResponse(), meta: result.meta };
  return { data, meta: result.meta };
};
