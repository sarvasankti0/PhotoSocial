import { useRef, useState } from "react";
import { ImagePlus, X, RefreshCw, UploadCloud, Check, Camera } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { validateMediaFile, validateCaption } from "../lib/validators";
import { imageToDataUrl } from "../lib/imageDataUrl";
import { createPostDraft, attachPostImage, cleanupDraftPost } from "../services/posts";
import { formatBytes } from "../lib/format";
import Loading from "./Loading";

const STEPS = {
  idle: "idle",
  preparing: "Preparing image...",
  publishing: "Publishing...",
  published: "Published",
};

export default function CreatePost({ onPublished }) {
  const { profile } = useAuth();
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null); // { objectUrl, dataUrl, name, size }
  const [caption, setCaption] = useState("");
  const [step, setStep] = useState(STEPS.idle);
  const [error, setError] = useState("");

  const isBusy = step !== STEPS.idle && step !== STEPS.published;

  const handlePick = async (file) => {
    if (!file) return;
    setError("");
    const check = validateMediaFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    if (preview?.objectUrl) URL.revokeObjectURL(preview.objectUrl);

    try {
      setStep(STEPS.preparing);
      const { dataUrl, size } = await imageToDataUrl(file, "post");
      setPreview({ objectUrl: dataUrl, dataUrl, name: file.name, size });
      setStep(STEPS.idle);
    } catch (err) {
      console.error("Prepare failed", err);
      setError(err.message || "Could not prepare this image.");
      setStep(STEPS.idle);
    }
  };

  const handleReplace = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = () => {
    if (preview?.objectUrl) URL.revokeObjectURL(preview.objectUrl);
    setPreview(null);
    setCaption("");
    setStep(STEPS.idle);
    setError("");
  };

  const handlePublish = async () => {
    if (!preview || !profile) return;
    const captionCheck = validateCaption(caption);
    if (!captionCheck.ok) {
      setError(captionCheck.error);
      return;
    }

    setError("");
    let createdPostId = null;
    try {
      setStep(STEPS.publishing);
      const postId = await createPostDraft({
        authorId: profile.uid,
        authorName: profile.displayName || profile.username || "Anonymous",
        authorPhotoURL: profile.photoURL || "",
        caption: caption.trim(),
        fileSize: preview.size,
        isPrivate: profile.isPrivate === true,
      });
      createdPostId = postId;

      await attachPostImage(postId, preview.dataUrl);

      setStep(STEPS.published);
      setTimeout(() => onPublished?.(), 900);
    } catch (err) {
      console.error("Publish failed", err);
      if (createdPostId) {
        await cleanupDraftPost(createdPostId, profile.uid).catch(() => {});
      }
      setError(err.message || "Publishing failed. Please try again.");
      setStep(STEPS.idle);
    }
  };

  if (step === STEPS.published) {
    return (
      <div className="create-published">
        <span className="published-icon">
          <Check size={40} />
        </span>
        <h2>Published</h2>
        <p>Your photo is live in the feed.</p>
      </div>
    );
  }

  return (
    <section className="create-page">
      <div className="create-card">
        <div className="create-header">
          <h1>New post</h1>
          {preview && (
            <button className="text-button" onClick={handleReplace}>
              <RefreshCw size={16} /> Replace
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden-input"
          onChange={(e) => handlePick(e.target.files?.[0])}
        />

        {error && <div className="form-error">{error}</div>}

        {!preview ? (
          <div className="drop-zone" onClick={() => fileInputRef.current?.click()}>
            <div className="drop-zone-icon">
              <ImagePlus size={40} />
            </div>
            <h3>Select a photo to share</h3>
            <p>JPEG, PNG, WEBP or GIF. Photos only for now.</p>
            <button className="primary-button" onClick={() => fileInputRef.current?.click()}>
              <Camera size={18} /> Choose photo
            </button>
          </div>
        ) : (
          <div className="preview-area">
            <div className="preview-image">
              <img src={preview.objectUrl} alt="Preview of your photo" />
              <button className="preview-remove" onClick={handleRemove} aria-label="Remove photo">
                <X size={18} />
              </button>
            </div>

            <div className="create-meta">
              <p className="preview-name" title={preview.name}>
                {preview.name || "Selected photo"}
                <span className="preview-size">→ {formatBytes(preview.size)}</span>
              </p>
              <textarea
                className="caption-input"
                placeholder="Write a caption..."
                value={caption}
                maxLength={2200}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
              />
              <span className="char-count">{caption.length}/2200</span>
            </div>

            <button className="primary-button publish-button" onClick={handlePublish} disabled={isBusy}>
              {isBusy ? (
                <>
                  <Loading size={18} />
                  {step}
                </>
              ) : (
                <>
                  <UploadCloud size={18} /> Publish
                </>
              )}
            </button>
          </div>
        )}

        {isBusy && (
          <div className="progress-strip" role="status">
            {Object.values(STEPS)
              .filter((s) => s !== STEPS.idle && s !== STEPS.published)
              .map((s) => (
                <span key={s} className={step === s ? "is-current" : "is-done"}>
                  {s}
                </span>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
