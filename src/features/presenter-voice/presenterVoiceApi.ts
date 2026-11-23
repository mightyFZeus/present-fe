import { request } from "@/lib/api/request";
import {
  invalidResponse,
  isRecord,
  presentationPath,
  unwrapData,
  uuid,
} from "@/lib/api/responseHelpers";
import { api } from "@/store/services/api";
import type { AppDispatch, AppStore } from "@/store/store";

const accountVoicePath = "/v1/users/me/presenter-voice";

interface PresenterVoiceStatus {
  enabled: boolean;
  enrolled: boolean;
}
export interface GuestVoice {
  presenterVoiceId: string;
  expiresAt: string;
}

function readStatus(value: unknown): PresenterVoiceStatus | undefined {
  if (isRecord(value) && typeof value.enabled === "boolean" &&
      typeof value.enrolled === "boolean" && (value.enabled || !value.enrolled)) {
    return { enabled: value.enabled, enrolled: value.enrolled };
  }
}

function readGuest(value: unknown): GuestVoice | undefined {
  if (!isRecord(value) || typeof value.presenterVoiceId !== "string" ||
      typeof value.expiresAt !== "string" || !(Date.parse(value.expiresAt) > Date.now())) {
    return;
  }
  try {
    uuid(value.presenterVoiceId);
    return { presenterVoiceId: value.presenterVoiceId, expiresAt: value.expiresAt };
  } catch {
    return;
  }
}

export const presenterVoiceApi = api.injectEndpoints({
  endpoints: (build) => ({
    presenterVoiceStatus: build.query<PresenterVoiceStatus, void>({
      async queryFn(_arg, _api, _options, baseQuery) {
        const response = await baseQuery({ url: accountVoicePath });
        if (response.error) return { error: response.error };
        const data = readStatus(response.data);
        return data ? { data } : { error: invalidResponse() };
      },
    }),
  }),
});

export const { usePresenterVoiceStatusQuery } = presenterVoiceApi;

type Runtime = AppStore["resources"];

export const saveAccountVoice = (sample: ArrayBuffer, signal: AbortSignal) =>
  async (dispatch: AppDispatch, _state: AppStore["getState"], extra: Runtime) => {
    const result = await request({
      url: accountVoicePath,
      method: "PUT",
      contentType: "application/octet-stream",
      data: sample,
    }, { dispatch, signal, extra });
    if (result.error) throw new Error(result.error.message);
    const data = readStatus(unwrapData(result.data));
    if (!data?.enabled || !data.enrolled) throw new Error(invalidResponse().message);
    dispatch(presenterVoiceApi.util.updateQueryData("presenterVoiceStatus", undefined, (draft) => {
      draft.enabled = data.enabled;
      draft.enrolled = data.enrolled;
    }));
  };

export const saveGuestVoice = (id: string, sample: ArrayBuffer, signal: AbortSignal) =>
  async (dispatch: AppDispatch, _state: AppStore["getState"], extra: Runtime) => {
    const result = await request({
      url: `${presentationPath(id)}/presenter-voice`,
      method: "POST",
      contentType: "application/octet-stream",
      data: sample,
    }, { dispatch, signal, extra });
    if (result.error) throw new Error(result.error.message);
    const data = readGuest(unwrapData(result.data));
    if (!data) throw new Error(invalidResponse().message);
    return data;
  };
