import { createAsyncThunk } from "@reduxjs/toolkit";
import type { ApiThunkConfig } from "@/lib/api/thunkTypes";
import { request } from "@/lib/api/request";
import { invalidResponse } from "@/lib/api/responseHelpers";
import type { ApiError } from "@/lib/api/apiTypes";
import { transcriptApi, transcriptPath, transcriptFinishKey } from "./transcriptApi";

export const downloadTranscript = createAsyncThunk<
  void, { presentationId: string; transcriptId: string }, ApiThunkConfig
>("transcripts/download", async ({ presentationId, transcriptId }, context) => {
  const result = await request({
    url: `${transcriptPath(presentationId, transcriptId)}/download`,
    responseType: "blob",
  }, context);
  if (result.error) return context.rejectWithValue(result.error);
  if (context.signal.aborted || !context.extra.isCurrent(result.meta.generation) ||
      !(result.data instanceof Blob) || result.data.size > 4 * 1024 * 1024 ||
      !result.data.type.startsWith("text/plain")) return context.rejectWithValue(invalidResponse());
  const url = URL.createObjectURL(result.data);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `prezntly-session-${transcriptId}.txt`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
});

export const finishTranscript = createAsyncThunk<
  void, { presentationId: string; transcriptId: string }, ApiThunkConfig
>("transcripts/finish", async ({ presentationId, transcriptId }, context) => {
  const task = context.dispatch(transcriptApi.endpoints.finishTranscript.initiate(
    { presentationId, transcriptId },
    { fixedCacheKey: transcriptFinishKey(presentationId, transcriptId) },
  ));
  try { await task.unwrap(); }
  catch (error) { return context.rejectWithValue(error as ApiError); }
});
