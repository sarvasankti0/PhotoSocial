import { useRef, useState } from "react";
import { X, Camera } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Loading from "./Loading";
import { addStatus } from "../services/statuses";
import { imageToDataUrl } from "../lib/imageDataUrl";

/**
 * Modal to publish a new 24-hour status photo (with an optional caption).
 * Multiple statuses can be posted; each is its own 24-hour story slide.
 */
export default function CreateStatusModal({ onClose }) {
  const { firebaseUser, profile } = useAuth();
  const [photo, setPhoto] = useState(null); // base64 data URL
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      setBusy(true);
      const { dataUrl } = await imageToDataUrl(file, "status");
      setPhoto(dataUrl);
    } catch (err) {
      console.error("Status photo prepare failed", err?.message, err);
      setError(err?.message || "Could not prepare this photo.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!firebaseUser || busy || !photo) return;
    setBusy(true);
    setError("");
    try {
      await addStatus(firebaseUser.uid, {
        imageUrl: photo,
        caption: caption.trim(),
        isPrivate: Boolean(profile?.isPrivate),
        authorName: profile?.displayName || profile?.username || "User",
        authorPhotoURL: profile?.photoURL || "",
      });
      onClose();
    } catch (err) {
      console.error("Status share failed", err?.code, err?.message, err);
      setError(err?.message || "Could not share your status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add status"
      >
        <header className="modal-card-header">
          <h3>Add status</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </header>

        <div className="modal-card-body">
          {photo ? (
            <img src={photo} alt="Status preview" className="status-preview" />
          ) : (
            <button className="status-pick" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Camera size={28} />
              <span>Choose a photo for your status</span>
              <span className="status-hint">Visible for 24 hours</span>
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden-input"
            onChange={pick}
          />

          {photo && (
            <label className="field">
              <span>Caption</span>
              <textarea
                value={caption}
                maxLength={2200}
                rows={2}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption (optional)"
              />
              <span className="char-count">{caption.length}/2200</span>
            </label>
          )}

          {error && <div className="form-error">{error}</div>}

          {photo && (
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setPhoto(null)} disabled={busy}>
                Choose another
              </button>
              <button className="primary-button" onClick={share} disabled={busy}>
                {busy ? <Loading size={18} /> : "Share status"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
