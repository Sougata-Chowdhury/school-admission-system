// The API URL can be configured at container runtime through VITE_API_BASE_URL.
// nginx writes /config.js from that environment variable when the container starts,
// which lets the same built image point at a different backend without rebuilding.
const runtimeConfig =
  typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined;

export const API_BASE_URL =
  runtimeConfig?.apiBaseUrl ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080';

export function getErrorMessage(error, fallback) {
  const data = error?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return data;
  }

  if (data?.errors && typeof data.errors === 'object') {
    const firstValidationError = Object.values(data.errors)
      .flat()
      .find((message) => typeof message === 'string' && message.trim());
    if (firstValidationError) {
      return firstValidationError;
    }
  }

  if (data?.message) {
    return data.message;
  }

  if (data?.title) {
    return data.title;
  }

  if (error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. Please make sure the backend is running and try again.';
  }

  return fallback;
}
