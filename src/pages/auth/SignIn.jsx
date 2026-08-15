import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Loading from "../../components/Loading";
import AuthShell from "./AuthShell";
import useAuthForm from "./useAuthForm";
import { validateEmail } from "../../lib/validators";

export default function SignIn({ onSwitchMode }) {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { busy, error, setError, submit, handleGoogle } = useAuthForm();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailCheck = validateEmail(email);
    if (!emailCheck.ok) return setError(emailCheck.error);
    if (!password) return setError("Enter your password.");
    await submit(() => signInWithEmail(email.trim(), password), "Email sign-in failed");
  };

  return (
    <AuthShell mode="signin" onSwitchMode={onSwitchMode} busy={busy} error={error} onGoogle={handleGoogle}>
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
              placeholder="Your password"
              autoComplete="current-password"
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

        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? (
            <>
              <Loading size={18} /> Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
