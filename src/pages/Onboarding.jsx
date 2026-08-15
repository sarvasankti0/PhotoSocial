import { useEffect, useRef, useState } from "react";
import { Camera, Check, Sparkles, User as UserIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import Loading from "../components/Loading";
import { imageToDataUrl } from "../lib/imageDataUrl";
import { updateUserProfile, isUsernameAvailable } from "../services/users";

export default function Onboarding({ onDone }) {
  const { firebaseUser, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [username, setUsername] = useState(profile?.username || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || "");
  const [usernameState, setUsernameState] = useState("idle"); // idle | checking | available | taken
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const avatarInputRef = useRef(null);
  const usernameTimer = useRef(null);

  useEffect(() => {
    clearTimeout(usernameTimer.current);
    const value = username.trim().toLowerCase();
    if (!value) {
      setUsernameState("idle");
      return;
    }
    if (value === (profile?.username || "").toLowerCase()) {
      setUsernameState("available");
      return;
    }
    setUsernameState("checking");
    usernameTimer.current = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(value, firebaseUser?.uid);
        setUsernameState(available ? "available" : "taken");
      } catch {
        setUsernameState("idle");
      }
    }, 450);
    return () => clearTimeout(usernameTimer.current);
  }, [username, profile?.username, firebaseUser?.uid]);

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const { dataUrl } = await imageToDataUrl(file, "avatar");
      setPhotoURL(dataUrl);
    } catch (err) {
      console.error("Avatar prepare failed", err);
      setError(err.message || "Could not prepare your profile photo.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firebaseUser || saving) return;
    setError("");

    const cleanName = displayName.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._]/g, "");
    if (!cleanName) return setError("Please enter your display name.");
    if (!cleanUsername) return setError("Please choose a username.");
    if (usernameState === "taken") return setError("That username is taken. Try another.");

    setSaving(true);
    try {
      await updateUserProfile(firebaseUser.uid, {
        displayName: cleanName,
        username: cleanUsername,
        bio: bio.trim(),
        photoURL,
        onboarded: true,
      });
      await refreshProfile();
      onDone?.();
    } catch (err) {
      console.error("Onboarding failed", err);
      setError(err.message || "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-screen">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <span className="brand-mark large">
            <Sparkles size={30} />
          </span>
          <h1>Set up your profile</h1>
          <p>Make it yours so people know who's behind the photos.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="onboarding-avatar">
            <Avatar src={photoURL} alt={displayName} size={92} className="onboarding-avatar-img" />
            <button type="button" className="text-button" onClick={() => avatarInputRef.current?.click()}>
              <Camera size={16} /> Choose a profile photo
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden-input"
              onChange={pickAvatar}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <label className="field">
            <span>Display name</span>
            <input
              value={displayName}
              maxLength={50}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex Rivera"
              required
            />
          </label>

          <label className="field">
            <span>Username</span>
            <div className="input-with-status">
              <input
                value={username}
                maxLength={30}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""))}
                placeholder="username"
                required
              />
              <span className={`username-status is-${usernameState}`}>
                {usernameState === "checking" && <Loading size={14} />}
                {usernameState === "available" && <Check size={16} />}
                {usernameState === "taken" && <UserIcon size={16} />}
              </span>
            </div>
            <span className="field-hint">
              {usernameState === "available" && "Username is available"}
              {usernameState === "taken" && "This username is taken"}
              {usernameState === "idle" && "Letters, numbers, dots and underscores"}
            </span>
          </label>

          <label className="field">
            <span>Bio</span>
            <textarea
              value={bio}
              maxLength={150}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people about yourself (optional)"
            />
            <span className="char-count">{bio.length}/150</span>
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? <Loading size={18} /> : "Get started"}
          </button>
        </form>
      </div>
    </div>
  );
}
