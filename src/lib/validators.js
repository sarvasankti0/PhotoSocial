const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Images are uploaded as-is (no client compression), so cap the file size at a
// reasonable photo size instead of accepting huge originals.
const MAX_INPUT_MB = 10;

/**
 * Validate an uploaded file. V1 supports photo posts only.
 * @param {File} file
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateMediaFile(file) {
  if (!file) {
    return { ok: false, error: "No file selected." };
  }

  if (file.type && file.type.startsWith("video/")) {
    return { ok: false, error: "Videos are not supported yet. PhotoSocial v1 is photo-only." };
  }

  if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: "Unsupported file type. Please choose a JPEG, PNG, WEBP or GIF image." };
  }

  if (file.size > MAX_INPUT_MB * 1024 * 1024) {
    return { ok: false, error: `Image is too large. Please choose a file under ${MAX_INPUT_MB} MB.` };
  }

  return { ok: true };
}

/**
 * Validate a caption before publishing.
 * @param {string} caption
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateCaption(caption) {
  const value = (caption || "").trim();
  if (value.length > 2200) {
    return { ok: false, error: "Caption is too long (max 2,200 characters)." };
  }
  return { ok: true };
}

/**
 * Validate a comment text before posting.
 * @param {string} text
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateComment(text) {
  const value = (text || "").trim();
  if (!value) {
    return { ok: false, error: "Write a comment first." };
  }
  if (value.length > 1000) {
    return { ok: false, error: "Comment is too long (max 1,000 characters)." };
  }
  return { ok: true };
}

/**
 * Validate a display name / bio value.
 * @param {string} value
 * @param {number} max
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateText(value, max) {
  const trimmed = (value || "").trim();
  if (trimmed.length > max) {
    return { ok: false, error: `Too long (max ${max} characters).` };
  }
  return { ok: true };
}

/**
 * Validate an email address before sign-in / sign-up.
 * @param {string} email
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateEmail(email) {
  const value = (email || "").trim();
  if (!value) {
    return { ok: false, error: "Enter your email address." };
  }
  // A conservative check: exactly one @, a non-empty local part, and a
  // dotted non-empty domain (matches the format Firebase accepts).
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(value)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true };
}

const PASSWORD_CHECKS = [
  { test: (v) => v.length >= 8, label: "at least 8 characters" },
  { test: (v) => /[A-Z]/.test(v), label: "one uppercase letter" },
  { test: (v) => /[a-z]/.test(v), label: "one lowercase letter" },
  { test: (v) => /\d/.test(v), label: "one number" },
];

/**
 * Validate a password against the strong-password policy.
 * @param {string} password
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateStrongPassword(password) {
  const value = password || "";
  const failed = PASSWORD_CHECKS.filter((c) => !c.test(value));
  if (failed.length === 0) return { ok: true };
  return {
    ok: false,
    error: `Password must include ${failed.map((c) => c.label).join(", ")}.`,
  };
}

/**
 * Individual password requirement checks, used to render a live checklist.
 * @param {string} password
 * @returns {Array<{ label: string, met: boolean }>}
 */
export function passwordRequirements(password) {
  return PASSWORD_CHECKS.map((c) => ({ label: c.label, met: c.test(password || "") }));
}
