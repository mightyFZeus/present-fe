import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppStore } from "@/store/store";
import type { ApiThunkConfig } from "@/lib/api/thunkTypes";
import { request } from "@/lib/api/request";
import { invalidResponse, presentationPath, unwrapData, uuid } from "@/lib/api/responseHelpers";
import { assetLoaded, assetRemoved } from "./assetsSlice";
import { presentationsApi } from "./presentationsApi";
import type { AssetResource, Presentation } from "./presentationTypes";

const uploadRequest = createAsyncThunk<
  Presentation, { uploadId: string }, ApiThunkConfig
>("presentations/upload", async ({ uploadId }, context) => {
  const file = context.extra.takeFile(uploadId);
  if (!file || file.size > 20 * 1024 * 1024 ||
      !/\.(pdf|pptx)$/i.test(file.name) || new TextEncoder().encode(file.name).length > 255) {
    return context.rejectWithValue({ status: 400, message: "Choose a PDF or PPTX within the 20 MiB upload limit." });
  }
  const data = new FormData();
  data.append("document", file);
  // The browser/Axios sets multipart Content-Type and its boundary.
  const result = await request({ url: "/v1/presentations", method: "POST", data }, context);
  if (result.error) return context.rejectWithValue(result.error);
  const presentation = unwrapData<Presentation>(result.data);
  if (!presentation) return context.rejectWithValue(invalidResponse());
  context.dispatch(presentationsApi.util.invalidateTags([{ type: "Presentations", id: "LIST" }]));
  return presentation;
});

export function uploadPresentation(store: AppStore, file: File) {
  return store.dispatch(uploadRequest({ uploadId: store.resources.putFile(file) }));
}

function assetThunk(name: string, path: (args: { presentationId: string; slideId?: string }) => string) {
  return createAsyncThunk<
    AssetResource, { presentationId: string; slideId?: string }, ApiThunkConfig
  >(name, async (args, context) => {
    let url: string;
    try { url = path(args); }
    catch { return context.rejectWithValue({ status: 400, message: "A valid presentation/slide UUID is required." }); }
    const result = await request({ url, responseType: "blob" }, context);
    if (result.error) return context.rejectWithValue(result.error);
    if (context.signal.aborted || !(result.data instanceof Blob) || !context.extra.isCurrent(result.meta.generation)) {
      return context.rejectWithValue(invalidResponse());
    }
    const resource: AssetResource = {
      key: url,
      url: context.extra.replaceAsset(url, result.data),
      contentType: result.data.type,
      size: result.data.size,
    };
    context.dispatch(assetLoaded(resource));
    return resource;
  });
}

export const loadPresentationSource = assetThunk(
  "assets/source", ({ presentationId }) => `${presentationPath(presentationId)}/source`,
);
export const loadSlideImage = assetThunk(
  "assets/slide", ({ presentationId, slideId }) => `${presentationPath(presentationId)}/slides/${uuid(slideId ?? "")}/image`,
);
export const releaseAsset = createAsyncThunk<void, string | { key: string; url?: string }, ApiThunkConfig>(
  "assets/release", (input, context) => {
    const value = typeof input === "string" ? { key: input } : input;
    context.extra.releaseAsset(value.key, value.url);
    context.dispatch(assetRemoved(value));
  },
);
