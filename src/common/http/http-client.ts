import axios, { AxiosRequestConfig } from 'axios';

// Outbound HTTP client (ARASAAC, Clonar-voz): one axios instance per external service with its base URL and
// timeout, and methods that return the body directly (without repeating `await res.json()` in every adapter).
// `getOrNull` treats 404 as "does not exist" instead of an error.
export function httpClient(baseURL: string, timeout: number) {
  const http = axios.create({ baseURL, timeout });
  return {
    get: <T>(url: string, config?: AxiosRequestConfig) => http.get<T>(url, config).then((res) => res.data),
    getOrNull: <T>(url: string, config?: AxiosRequestConfig) =>
      http
        .get<T>(url, { ...config, validateStatus: (status) => status < 300 || status === 404 })
        .then((res) => (res.status === 404 ? null : res.data)),
    post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => http.post<T>(url, body, config).then((res) => res.data),
    delete: (url: string) => http.delete(url).then(() => undefined),
  };
}
