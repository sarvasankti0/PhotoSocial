import { Camera } from "lucide-react";
import Loading from "../../components/Loading";

/**
 * Shared auth screen shell: brand header, Sign in / Create account tabs,
 * the page's form (children), error box, Google button and terms.
 * @param {{
 *   mode: "signin" | "signup",
 *   onSwitchMode: (mode: "signin" | "signup") => void,
 *   busy: boolean,
 *   error: string,
 *   onGoogle: () => void,
 *   children: import("react").ReactNode,
 * }} props
 */
export default function AuthShell({ mode, onSwitchMode, busy, error, onGoogle, children }) {
  const isSignup = mode === "signup";
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark large">
            <Camera size={34} />
          </span>
          <h1>PhotoSocial</h1>
          <p className="auth-tagline">Share your world through photos.</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Sign in options">
          <button
            type="button"
            className={`auth-tab ${!isSignup ? "is-active" : ""}`}
            onClick={() => onSwitchMode("signin")}
            role="tab"
            aria-selected={!isSignup}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`auth-tab ${isSignup ? "is-active" : ""}`}
            onClick={() => onSwitchMode("signup")}
            role="tab"
            aria-selected={isSignup}
          >
            Create account
          </button>
        </div>

        {children}

        {error && <div className="form-error">{error}</div>}

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button className="primary-button google-button" onClick={onGoogle} disabled={busy}>
          {busy ? (
            <Loading size={18} />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p className="auth-terms">
          By continuing you agree to PhotoSocial's terms. Photos you share are stored in Firebase and visible to other
          signed-in users.
        </p>
      </div>
    </div>
  );
}
