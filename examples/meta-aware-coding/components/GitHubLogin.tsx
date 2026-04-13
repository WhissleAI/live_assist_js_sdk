import React from "react";

interface GitHubLoginProps {
  user: { login: string; avatar_url: string; name: string | null } | null;
  isLoggingIn: boolean;
  userCode: string | null;
  verificationUrl: string | null;
  error: string | null;
  onLogin: () => void;
  onCancelLogin: () => void;
  onLogout: () => void;
}

export function GitHubLogin({
  user,
  isLoggingIn,
  userCode,
  verificationUrl,
  error,
  onLogin,
  onCancelLogin,
  onLogout,
}: GitHubLoginProps) {
  if (user) {
    return (
      <div className="github-user">
        <img
          src={user.avatar_url}
          alt={user.login}
          className="github-avatar"
        />
        <span className="github-username">{user.name ?? user.login}</span>
        <button type="button" className="btn-github-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    );
  }

  if (isLoggingIn && userCode) {
    return (
      <div className="github-device-flow">
        <div className="device-flow-instructions">
          Go to{" "}
          <a
            href={verificationUrl ?? "https://github.com/login/device"}
            target="_blank"
            rel="noopener noreferrer"
            className="device-flow-link"
          >
            github.com/login/device
          </a>
        </div>
        <div className="device-flow-code">{userCode}</div>
        <button
          type="button"
          className="btn-github-cancel"
          onClick={onCancelLogin}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="github-login">
      <button
        type="button"
        className="btn-github-login"
        onClick={onLogin}
        disabled={isLoggingIn}
      >
        {isLoggingIn ? "Connecting..." : "Login with GitHub"}
      </button>
      {error && <span className="github-error">{error}</span>}
    </div>
  );
}
