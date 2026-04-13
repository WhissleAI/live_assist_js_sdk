import { useState, useEffect, useCallback, useRef } from "react";

/**
 * GitHub OAuth via Device Flow.
 *
 * Flow:
 * 1. User clicks "Login with GitHub"
 * 2. App requests device code from GitHub
 * 3. User opens github.com/login/device and enters the code
 * 4. App polls GitHub for access token
 * 5. Token stored in localStorage
 *
 * No backend needed — device flow is designed for CLI/native apps.
 */

const STORAGE_KEY = "meta-aware-coding:github-token";
const USER_KEY = "meta-aware-coding:github-user";

// GitHub OAuth App client ID — users should replace this with their own
// Create one at: https://github.com/settings/applications/new
// Set "Device flow" to enabled, no callback URL needed
const CLIENT_ID = "Ov23li0000000000000"; // placeholder — replace with real ID

interface GitHubUser {
  login: string;
  avatar_url: string;
  name: string | null;
  html_url: string;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface GitHubState {
  token: string | null;
  user: GitHubUser | null;
  isLoggingIn: boolean;
  userCode: string | null;
  verificationUrl: string | null;
  error: string | null;
}

export function useGitHub(clientId?: string) {
  const appClientId = clientId ?? CLIENT_ID;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<GitHubState>(() => {
    const savedToken = localStorage.getItem(STORAGE_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    return {
      token: savedToken,
      user: savedUser ? JSON.parse(savedUser) : null,
      isLoggingIn: false,
      userCode: null,
      verificationUrl: null,
      error: null,
    };
  });

  // Fetch user profile when token is available but user isn't loaded
  useEffect(() => {
    if (state.token && !state.user) {
      fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${state.token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Invalid token");
          return res.json();
        })
        .then((user: GitHubUser) => {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          setState((s) => ({ ...s, user }));
        })
        .catch(() => {
          // Token is invalid, clear it
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(USER_KEY);
          setState((s) => ({ ...s, token: null, user: null }));
        });
    }
  }, [state.token, state.user]);

  const login = useCallback(async () => {
    setState((s) => ({ ...s, isLoggingIn: true, error: null, userCode: null }));

    try {
      // Step 1: Request device code
      const res = await fetch("https://github.com/login/device/code", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: appClientId,
          scope: "repo user",
        }),
      });

      if (!res.ok) {
        throw new Error(`GitHub device code request failed: ${res.status}`);
      }

      const data: DeviceCodeResponse = await res.json();
      setState((s) => ({
        ...s,
        userCode: data.user_code,
        verificationUrl: data.verification_uri,
      }));

      // Step 2: Poll for token
      const interval = (data.interval || 5) * 1000;
      const expiresAt = Date.now() + data.expires_in * 1000;

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (Date.now() > expiresAt) {
          if (pollRef.current) clearInterval(pollRef.current);
          setState((s) => ({
            ...s,
            isLoggingIn: false,
            userCode: null,
            error: "Login expired. Try again.",
          }));
          return;
        }

        try {
          const tokenRes = await fetch(
            "https://github.com/login/oauth/access_token",
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                client_id: appClientId,
                device_code: data.device_code,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              }),
            },
          );

          const tokenData = await tokenRes.json();

          if (tokenData.access_token) {
            if (pollRef.current) clearInterval(pollRef.current);
            localStorage.setItem(STORAGE_KEY, tokenData.access_token);
            setState((s) => ({
              ...s,
              token: tokenData.access_token,
              isLoggingIn: false,
              userCode: null,
              verificationUrl: null,
            }));
          }
          // "authorization_pending" — keep polling
          // "slow_down" — handled by the interval
        } catch {
          // Network error — keep polling
        }
      }, interval);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((s) => ({ ...s, isLoggingIn: false, error: msg }));
    }
  }, [appClientId]);

  const cancelLogin = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setState((s) => ({
      ...s,
      isLoggingIn: false,
      userCode: null,
      verificationUrl: null,
    }));
  }, []);

  const logout = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
    setState({
      token: null,
      user: null,
      isLoggingIn: false,
      userCode: null,
      verificationUrl: null,
      error: null,
    });
  }, []);

  /** List user's repos (paginated, 30 per page). */
  const listRepos = useCallback(
    async (page = 1) => {
      if (!state.token) return [];
      const res = await fetch(
        `https://api.github.com/user/repos?sort=updated&per_page=30&page=${page}`,
        { headers: { Authorization: `Bearer ${state.token}` } },
      );
      if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
      return res.json();
    },
    [state.token],
  );

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return {
    ...state,
    login,
    cancelLogin,
    logout,
    listRepos,
  };
}
