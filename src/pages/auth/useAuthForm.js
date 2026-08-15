import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { describeError, POPUP_FALLBACK_CODES } from "./authErrors";

/**
 * Shared auth-form state: busy flag, error message and the Google and
 * email/password submit flows. Used by both the sign-in and sign-up pages.
 */
export default function useAuthForm() {
  const { signInWithGoogle, signInWithGoogleRedirect } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (action, logMessage = "Auth action failed") => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (err) {
      console.error(logMessage, err);
      setError(describeError(err.code, err.message));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Google sign-in failed", err);
      if (err.code === "auth/popup-closed-by-user") {
        setError("");
      } else if (POPUP_FALLBACK_CODES.includes(err.code)) {
        // Popup unavailable — fall back to the redirect flow.
        try {
          await signInWithGoogleRedirect();
        } catch (redirectErr) {
          console.error("Redirect sign-in failed", redirectErr);
          setError(describeError(redirectErr.code, redirectErr.message));
        }
      } else {
        setError(describeError(err.code, err.message));
      }
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, setError, submit, handleGoogle };
}
