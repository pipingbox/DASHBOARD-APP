// Runtime configuration - Supabase is used directly, no runtime config endpoint needed

// Detect if running in production (not localhost)
function isProductionEnv(): boolean {
  if (typeof window === 'undefined') return true;
  const origin = window.location.origin;
  return (
    !origin.includes('localhost') &&
    !origin.includes('127.0.0.1') &&
    !origin.includes('0.0.0.0')
  );
}

// Default fallback configuration
const defaultConfig = {
  API_BASE_URL: isProductionEnv() ? '' : 'http://127.0.0.1:8000',
};

// No-op: kept for backward compatibility with any imports
export function loadRuntimeConfig(): void {
  // No runtime config fetch needed - app uses Supabase directly
}

// Get current configuration
export function getConfig() {
  // Try Vite environment variables (for local development)
  if (import.meta.env.VITE_API_BASE_URL) {
    return {
      API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    };
  }

  return defaultConfig;
}

// Dynamic API_BASE_URL getter
export function getAPIBaseURL(): string {
  const baseURL = getConfig().API_BASE_URL;
  if (baseURL === '/') {
    return '';
  }
  return baseURL;
}

export const config = {
  get API_BASE_URL() {
    return getAPIBaseURL();
  },
};