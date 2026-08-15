import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Loading from "../../components/Loading";
import AuthShell from "./AuthShell";
import useAuthForm from "./useAuthForm";
import { validateEmail, validateStrongPassword, passwordRequirements } from "../../lib/validators";

export default function SignUp({ onSwitchMode }) {
  const { signUpWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { busy, error, setError, submit, handleGoogle } = useAuthForm();

  const requirements = passwordRequirements(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return setError(emailCheck.error);
    const passCheck = validateStrongPassword(password);
    if (!passCheck.ok) return setError(passCheck.error);
    if (password !== confirmPassword) return setError("Passwords do not match.");
    await submit(() => signUpWithEmail(email.trim(), password), "Email sign-up failed");
  };

  return (
    <AuthShell mode="signup" onSwitchMode={onSwitchMode} busy={busy} error={error} onGoogle={handleGoogle}>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <div className="password-input">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className="icon-button password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <label className="field">
          <span>Confirm password</span>
          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            required
          />
        </label>

        <ul className="password-requirements" aria-label="Password requirements">
          {requirements.map((req) => (
            <li key={req.label} className={req.met ? "is-met" : ""}>
              <span className="requirement-dot">{req.met ? "✓" : "•"}</span>
              {req.label}
            </li>
          ))}
        </ul>

        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? (
            <>
              <Loading size={18} /> Creating account...
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
