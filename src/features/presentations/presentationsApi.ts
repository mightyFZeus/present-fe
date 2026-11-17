import { api } from "@/store/services/api";
import { presentationPath } from "@/lib/api/responseHelpers";
import type { NavigationProposal, NavigationSnapshot } from "@/features/live/liveTypes";
import type { Presentation, PresentationPage, PresentationSlide, RetrievalMatch } from "./presentationTypes";

export const presentationsApi = api.injectEndpoints({
  endpoints: (build) => ({
    listPresentations: build.infiniteQuery<PresentationPage, void, string>({
      infiniteQueryOptions: {
        initialPageParam: "",
        getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
      },
      query: ({ pageParam }) => {
        const query = new URLSearchParams({ limit: "20" });
        if (pageParam) query.set("cursor", pageParam);
        return { url: `/v1/presentations?${query.toString()}` };
      },
      providesTags: [{ type: "Presentations", id: "LIST" }],
    }),
    renamePresentation: build.mutation<Presentation, { presentationId: string; filename: string }>({
      query: ({ presentationId, filename }) => ({
        url: presentationPath(presentationId),
        method: "PATCH",
        data: { filename },
      }),
      invalidatesTags: (_result, error, { presentationId }) => error ? [] : [
        { type: "Presentations", id: "LIST" },
        { type: "Presentations", id: presentationId },
      ],
    }),
    deletePresentation: build.mutation<null, string>({
      query: (id) => ({
        url: presentationPath(id),
        method: "DELETE",
        expectNoContent: true,
      }),
      invalidatesTags: (_result, error, id) => error ? [] : [
        { type: "Presentations", id: "LIST" },
        { type: "Presentations", id },
      ],
    }),
    getPresentation: build.query<Presentation, string>({
      query: (id) => ({ url: presentationPath(id) }),
      providesTags: (_result, _error, id) => [{ type: "Presentations", id }],
    }),
    getPresentationSlides: build.query<PresentationSlide[], string>({
      query: (id) => ({ url: `${presentationPath(id)}/slides` }),
      providesTags: (_result, _error, id) => [{ type: "Presentations", id }],
    }),
    retrievePresentation: build.mutation<RetrievalMatch[], { presentationId: string; query: string }>({
      query: ({ presentationId, query }) => ({
        url: `${presentationPath(presentationId)}/retrieve`,
        method: "POST",
        data: { query },
        timeoutMs: 185_000,
      }),
    }),
    proposePresentation: build.mutation<NavigationProposal, {
      presentationId: string;
      transcript: string;
      snapshot: NavigationSnapshot;
    }>({
      query: ({ presentationId, transcript, snapshot }) => ({
        url: `${presentationPath(presentationId)}/propose`,
        method: "POST",
        data: { transcript, snapshot },
        timeoutMs: 185_000,
      }),
    }),
  }),
});
export const {
  useListPresentationsInfiniteQuery,
  useGetPresentationQuery,
  useGetPresentationSlidesQuery,
  useRetrievePresentationMutation,
  useProposePresentationMutation,
} = presentationsApi;
