import axios from "axios";

export function getApiOrigin(): string | undefined {
  try {
    const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
    if (!value) return undefined;
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username || url.password || url.search || url.hash ||
        url.pathname !== "/") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export const axiosClient = axios.create({
  baseURL: getApiOrigin(),
  timeout: 15_000,
  headers: { Accept: "application/json" },
});
