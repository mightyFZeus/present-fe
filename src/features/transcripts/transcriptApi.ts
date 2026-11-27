import { api } from "@/store/services/api";
import { presentationPath, uuid } from "@/lib/api/responseHelpers";

export interface TranscriptSession {
  id: string;
  createdAt: string;
  endedAt: string | null;
  state: "active" | "paused" | "ended";
  segmentCount: number;
  incomplete: boolean;
}
export interface TranscriptPage { sessions: TranscriptSession[]; nextCursor: string }
export const transcriptPath = (presentationId: string, transcriptId: string) =>
  `${presentationPath(presentationId)}/transcripts/${uuid(transcriptId)}`;
export const transcriptFinishKey = (presentationId: string, transcriptId: string) =>
  `finish-${presentationId}-${transcriptId}`;
export const transcriptApi = api.injectEndpoints({
  endpoints: (build) => ({
    finishTranscript: build.mutation<null, { presentationId: string; transcriptId: string }>({
      query: ({ presentationId, transcriptId }) => ({
        url: `${transcriptPath(presentationId, transcriptId)}/finish`,
        method: "POST",
        data: {},
        expectNoContent: true,
      }),
      invalidatesTags: (_data, _error, { presentationId }) => [
        { type: "Presentations", id: `transcripts-${presentationId}` },
      ],
    }),
    listTranscripts: build.infiniteQuery<TranscriptPage, string, string>({
      infiniteQueryOptions: {
        initialPageParam: "",
        getNextPageParam: (page) => page.nextCursor || undefined,
      },
      query: ({ queryArg, pageParam }) => {
        const query = new URLSearchParams({ limit: "20" });
        if (pageParam) query.set("cursor", pageParam);
        return { url: `${presentationPath(queryArg)}/transcripts?${query}` };
      },
      providesTags: (_data, _error, id) => [{ type: "Presentations", id: `transcripts-${id}` }],
    }),
  }),
});
export const { useListTranscriptsInfiniteQuery, useFinishTranscriptMutation } = transcriptApi;
