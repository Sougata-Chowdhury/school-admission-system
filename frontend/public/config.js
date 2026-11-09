// Local development default. In Docker, nginx overwrites this file at container
// startup using the VITE_API_BASE_URL environment variable.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBaseUrl: 'http://localhost:8080',
};
