import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, Pencil, Trash2, Heart, MessageCircle } from "lucide-react";
import Avatar from "./Avatar";
import Loading from "./Loading";
import StatusCommentModal from "./StatusCommentModal";
import { timeAgo, formatCount } from "../lib/format";
import { updateStatus, deleteStatus, toggleStatusLike, isStatusLikedBy } from "../services/statuses";
import { validateCaption } from "../lib/validators";

const STATUS_VIEW_MS = 6000;

/**
 * Full-screen story-style viewer. Plays every active status of the selected
 * user in sequence (one slide per status), then moves on. The author can edit
 * the caption or delete a status directly from the viewer.
 */
export default function StatusViewer({ slides, index, viewerUid, onClose, onNavigate }) {
  const current = slides[index];
  const status = current?.status || {};
  const [progress, setProgress] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const next = useCallback(() => onNavigate(index + 1), [index, onNavigate]);
  const prev = useCallback(() => onNavigate(index - 1), [index, onNavigate]);

  // Animate the progress bar and auto-advance to the next slide.
  useEffect(() => {
    setProgress(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const pct = ((Date.now() - started) / STATUS_VIEW_MS) * 100;
      if (pct >= 100) {
        clearInterval(timer);
        onNavigate(index + 1);
      } else {
        setProgress(pct);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [index, onNavigate]);

  // Keyboard + body scroll lock.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, next, prev]);

  // If the current slide was deleted (list shrank), clamp back.
  useEffect(() => {
    if (slides.length === 0) {
      onClose();
      return;
    }
    if (index >= slides.length) {
      onNavigate(slides.length - 1);
    }
  }, [slides.length, index, onClose, onNavigate]);

  // Keep like state in sync with the live status doc (arrayUnion applies
  // locally, then the snapshot confirms), without fighting a realtime update.
  useEffect(() => {
    setLiked(isStatusLikedBy(status, viewerUid));
    setLikeCount(Array.isArray(status?.likes) ? status.likes.length : 0);
  }, [status, viewerUid]);

  if (!current) return null;

  const group = slides[index];
  const isOwn = Boolean(viewerUid && group.uid === viewerUid);
  const authorName = status.authorName || "User";
  const authorPhotoURL = status.authorPhotoURL || "";

  const handleSaveEdit = async (caption) => {
    if (!isOwn || busy) return;
    const check = validateCaption(caption);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateStatus(group.uid, status.id, { caption: caption.trim() });
      setEditing(false);
    } catch (err) {
      console.error("Status edit failed", err?.code, err?.message, err);
      setError(err?.message || "Could not save your status.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwn || busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteStatus(group.uid, status.id);
      setConfirmingDelete(false);
    } catch (err) {
      console.error("Status delete failed", err?.code, err?.message, err);
      setError(err?.message || "Could not delete your status.");
    } finally {
      setBusy(false);
    }
  };

  const handleLike = async () => {
    if (!viewerUid || likeBusy) return;
    setLikeBusy(true);
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      await toggleStatusLike(group.uid, status.id, viewerUid, liked);
    } catch (err) {
      console.error("Status like failed", err?.code, err?.message, err);
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setLikeBusy(false);
    }
  };

  return (
    <div className="status-viewer" role="dialog" aria-modal="true" aria-label="Status">
      <div className="status-progress">
        <div className="status-progress-bar" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>

      <div className="status-viewer-header">
        <span className="status-viewer-user">
          <Avatar src={authorPhotoURL} alt={authorName} size={34} />
          <strong>{authorName}</strong>
          <span className="status-viewer-time">
            {slides.length > 1 && (
              <span className="status-slide-count">
                {index + 1}/{slides.length}
              </span>
            )}
            {timeAgo(status.createdAt)}
          </span>
        </span>

        <span className="status-viewer-actions">
          {isOwn && (
            <>
              <button className="icon-button status-action" onClick={() => setEditing(true)} aria-label="Edit status">
                <Pencil size={20} />
              </button>
              <button
                className="icon-button status-action status-action-danger"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete status"
              >
                <Trash2 size={20} />
              </button>
            </>
          )}
          <button className="icon-button status-viewer-close" onClick={onClose} aria-label="Close status">
            <X size={24} />
          </button>
        </span>
      </div>

      <div className="status-viewer-body">
        {index > 0 && (
          <button className="status-nav status-prev" onClick={prev} aria-label="Previous status">
            <ChevronLeft size={28} />
          </button>
        )}
        <img src={status.imageUrl} alt={`${authorName}'s status`} className="status-image" onClick={next} />
        {index < slides.length - 1 && (
          <button className="status-nav status-next" onClick={next} aria-label="Next status">
            <ChevronRight size={28} />
          </button>
        )}
        {status.caption && <p className="status-caption">{status.caption}</p>}
      </div>

      <div className="status-actions">
        <button
          className={`status-action-btn ${liked ? "is-liked" : ""}`}
          onClick={handleLike}
          disabled={!viewerUid || likeBusy}
          aria-label={liked ? "Unlike status" : "Like status"}
          aria-pressed={liked}
        >
          <Heart size={24} fill={liked ? "currentColor" : "none"} />
          {likeCount > 0 && <span>{formatCount(likeCount)}</span>}
        </button>
        <button
          className="status-action-btn"
          onClick={() => setCommentsOpen(true)}
          aria-label="Comment on status"
        >
          <MessageCircle size={24} />
          {status.commentCount > 0 && <span>{formatCount(status.commentCount)}</span>}
        </button>
      </div>

      {commentsOpen && (
        <StatusCommentModal authorUid={group.uid} status={status} onClose={() => setCommentsOpen(false)} />
      )}

      {editing && (
        <EditStatusModal
          initialCaption={status.caption || ""}
          busy={busy}
          error={error}
          onSave={handleSaveEdit}
          onClose={() => setEditing(false)}
        />
      )}

      {confirmingDelete && (
        <div className="modal-overlay" onClick={() => !busy && setConfirmingDelete(false)}>
          <div className="modal-card status-confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete status">
            <h3>Delete this status?</h3>
            <p>It will disappear for everyone immediately.</p>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setConfirmingDelete(false)} disabled={busy}>
                Cancel
              </button>
              <button className="primary-button danger-button" onClick={handleDelete} disabled={busy}>
                {busy ? <Loading size={18} /> : <Trash2 size={16} />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditStatusModal({ initialCaption, busy, error, onSave, onClose }) {
  const [caption, setCaption] = useState(initialCaption);
  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit status">
        <header className="modal-card-header">
          <h3>Edit status</h3>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close">
            <X size={22} />
          </button>
        </header>
        <div className="modal-card-body">
          <label className="field">
            <span>Caption</span>
            <textarea
              value={caption}
              maxLength={2200}
              rows={3}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption (optional)"
            />
            <span className="char-count">{caption.length}/2200</span>
          </label>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button className="primary-button" onClick={() => onSave(caption)} disabled={busy}>
              {busy ? <Loading size={18} /> : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
