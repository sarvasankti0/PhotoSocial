export const ERROR_HINTS = {
  "auth/unauthorized-domain":
    "This preview domain is not authorized for sign-in. Add it in the Firebase console: Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed":
    "Email sign-in is not enabled for this Firebase project. Enable it in the Firebase console: Authentication → Sign-in method → Email/Password.",
  "auth/popup-blocked":
    "The sign-in popup was blocked. Allow popups for this site and try again.",
  "auth/network-request-failed":
    "A network error occurred. Check your connection and try again.",
  "auth/cancelled-popup-request":
    "The sign-in request was cancelled. Try again.",
  "auth/email-already-in-use":
    "An account already exists for this email. Try signing in instead.",
  "auth/invalid-credential":
    "Incorrect email or password.",
  "auth/invalid-email":
    "Enter a valid email address.",
  "auth/missing-password":
    "Enter your password.",
  "auth/weak-password":
    "That password is too weak. Use a stronger password.",
  "auth/user-not-found":
    "No account found for this email.",
  "auth/wrong-password":
    "Incorrect password.",
  "auth/too-many-requests":
    "Too many attempts. Please wait a moment and try again.",
};

// Codes where the Google popup can't open (blocked, iframe, etc.) — fall back
// to the redirect flow so sign-in still works.
export const POPUP_FALLBACK_CODES = [
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-allowed",
  "auth/unauthorized-domain",
  "auth/web-storage-unsupported",
];

export function describeError(code, message) {
  const hint = ERROR_HINTS[code];
  if (hint) return hint;
  return message || `Sign-in failed (${code}). Please try again.`;
}
