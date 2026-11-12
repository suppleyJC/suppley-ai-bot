// Token storage key for Safari iOS fallback
export const AUTH_TOKEN_KEY = "suppley_auth_token";

// Helper to get stored token
export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
};

// Helper to store token
export const setStoredToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // localStorage not available
  }
};

// Helper to clear token and redirect to login
export const clearTokenAndRedirect = (): void => {
  setStoredToken(null);
  window.location.href = "/login";
};
