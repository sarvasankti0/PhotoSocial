import { useState, useEffect } from "react";
import { Heart, MessageCircle, Bookmark, MoreHorizontal, ImageOff, Trash2, Download, Ban, Pencil, X, Share2, Check } from "lucide-react";
import StatusAvatar from "./StatusAvatar";
import VerifiedBadge from "./VerifiedBadge";
import { timeAgo, formatCount } from "../lib/format";
import { toggleLike, isLikedBy } from "../services/likes";
import { savePost, unsavePost, subscribeSaved } from "../services/saves";
import { deletePost, setPostDownloads, updatePostCaption, ensurePostShareCode } from "../services/posts";
import { validateCaption } from "../lib/validators";
import { notifyPostLike } from "../services/notifications";
import Lightbox from "./Lightbox";

function imageCandidates(post) {
  return [post.imageUrl].filter(Boolean);
}

function extensionFromDataUrl(dataUrl) {
  const match = /^data:image\/([a-zA-Z0-9+.-]+)[;,]/i.exec(dataUrl || "");
  if (!match) return "jpg";
  const ext = match[1].toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

export default function PostCard({ post, currentUser, onCommentClick, onAuthorClick, onPostDeleted }) {
  const uid = currentUser?.uid;
  const isOwner = Boolean(uid && post.authorId === uid);

  const downloadsAllowed = post.authorAllowDownloads !== false && post.allowDownloads !== false;
  const perPostControlEnabled = post.authorAllowDownloads !== false && post.authorAllowPerPostDownloads !== false;

  const candidates = imageCandidates(post);
  const [srcIndex, setSrcIndex] = useState(0);
  const imageSrc = candidates[srcIndex] || "";

  const [liked, setLiked] = useState(() => isLikedBy(post, uid));
  const [likeCount, setLikeCount] = useState(() => (Array.isArray(post?.likes) ? post.likes.length : 0));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    setSrcIndex(0);
    setImgLoaded(false);
    setImgError(false);
    setMenuOpen(false);
    setConfirmingDelete(false);
    setZoomOpen(false);
  }, [post.id]);

  // The post prop is refreshed by realtime listeners in the feed/profile, so
  // keep like state in sync with the server without overriding an in-flight
  // optimistic toggle.
  useEffect(() => {
    setLiked(isLikedBy(post, uid));
    setLikeCount(Array.isArray(post?.likes) ? post.likes.length : 0);
  }, [post, uid]);

  // Live saved state: bookmark fills/unfills instantly from any device.
  useEffect(() => {
    if (!uid) return;
    return subscribeSaved(
      uid,
      post.id,
      (value) => setSaved(value),
      () => {}
    );
  }, [uid, post.id]);

  const handleImgError = () => {
    if (srcIndex < candidates.length - 1) {
      setImgLoaded(false);
      setImgError(false);
      setSrcIndex(srcIndex + 1);
    } else {
      setImgError(true);
    }
  };

  const handleLike = async () => {
    if (!uid || busy) return;
    setBusy(true);
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      await toggleLike(post.id, uid, liked);
      if (!liked) notifyPostLike(currentUser, post);
    } catch (err) {
      console.error("Like failed", err);
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!uid || busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next);
    try {
      if (next) await savePost(uid, post.id);
      else await unsavePost(uid, post.id);
    } catch (err) {
      console.error("Save failed", err);
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!isOwner || deleting) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deletePost(post.id, post.authorId);
      onPostDeleted?.(post.id);
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setDeleting(false);
      setMenuOpen(false);
      setConfirmingDelete(false);
    }
  };

  const handleDownload = () => {
    if (!downloadsAllowed || !post.imageUrl) return;
    const link = document.createElement("a");
    link.href = post.imageUrl;
    link.download = `photo-${post.id}.${extensionFromDataUrl(post.imageUrl)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const copyToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  };

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const code = await ensurePostShareCode(post);
      const url = `${window.location.origin}/post/${code}`;
      await copyToClipboard(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      console.error("Share failed", err?.code, err?.message, err);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDownloads = async () => {
    if (!isOwner || busy) return;
    setBusy(true);
    const next = post.allowDownloads === false;
    try {
      await setPostDownloads(post.id, next);
    } catch (err) {
      console.error("Download toggle failed", err);
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleSaveCaption = async (caption) => {
    const check = validateCaption(caption);
    if (!check.ok) return { ok: false, error: check.error };
    try {
      await updatePostCaption(post.id, caption);
      return { ok: true };
    } catch (err) {
      console.error("Caption update failed", err?.code, err?.message, err);
      return { ok: false, error: err?.message || "Could not save your caption." };
    }
  };

  return (
    <article className="post-card">
      {menuOpen && <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />}

      <header className="post-header">
        <button className="post-author" onClick={() => onAuthorClick?.(post.authorId)}>
          <StatusAvatar
            uid={post.authorId}
            src={post.authorPhotoURL}
            alt={post.authorName || "Author"}
            name={post.authorName}
            size={38}
          />
          <div className="post-author-meta">
            <strong>
              {post.authorName || "Anonymous"}
              {post.authorIsVerified && <VerifiedBadge size={15} />}
            </strong>
            <span>{timeAgo(post.createdAt)}</span>
          </div>
        </button>

        <div className="post-menu-wrap">
          <button className="icon-button" onClick={() => setMenuOpen((o) => !o)} aria-label="More options">
            <MoreHorizontal size={20} />
          </button>
          {menuOpen && (
            <div className="post-menu">
              {isOwner ? (
                <>
                  <button className="post-menu-item" onClick={() => { setMenuOpen(false); setEditingCaption(true); }}>
                    <Pencil size={16} /> Edit caption
                  </button>
                  {perPostControlEnabled && (
                    <button className="post-menu-item" onClick={handleToggleDownloads} disabled={busy}>
                      {post.allowDownloads === false ? <Ban size={16} /> : <Download size={16} />}
                      {post.allowDownloads === false ? "Enable downloads" : "Disable downloads"}
                    </button>
                  )}
                  <button className={`post-menu-item danger ${confirmingDelete ? "is-confirming" : ""}`} onClick={handleDelete} disabled={deleting}>
                    <Trash2 size={16} />
                    {deleting ? "Deleting..." : confirmingDelete ? "Tap again to confirm" : "Delete post"}
                  </button>
                </>
              ) : downloadsAllowed ? (
                <button className="post-menu-item" onClick={handleDownload}>
                  <Download size={16} /> Download photo
                </button>
              ) : (
                <span className="post-menu-item muted">No actions</span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className={`post-media ${imgLoaded ? "is-loaded" : ""}`}>
        {!imgLoaded && imageSrc && !imgError && <div className="post-media-skeleton" />}
        {imageSrc && !imgError ? (
          <img
            src={imageSrc}
            alt={post.caption || "Photo"}
            loading="lazy"
            onClick={() => setZoomOpen(true)}
            onLoad={() => setImgLoaded(true)}
            onError={handleImgError}
          />
        ) : (
          <div className="post-media-empty">
            <ImageOff size={28} />
            <span>{imageSrc ? "Image failed to load" : "Image unavailable"}</span>
          </div>
        )}
      </div>

      <div className="post-actions">
        <div className="post-actions-left">
          <button
            className={`icon-button like-button ${liked ? "is-liked" : ""}`}
            onClick={handleLike}
            aria-label={liked ? "Unlike" : "Like"}
            aria-pressed={liked}
          >
            <Heart size={24} fill={liked ? "currentColor" : "none"} />
          </button>
          <button className="icon-button" onClick={() => onCommentClick?.(post)} aria-label="Comment">
            <MessageCircle size={24} />
          </button>
          <button
            className={`icon-button share-button ${shareCopied ? "is-copied" : ""}`}
            onClick={handleShare}
            aria-label="Share post"
            aria-pressed={shareCopied}
          >
            {shareCopied ? <Check size={24} /> : <Share2 size={24} />}
          </button>
        </div>
        <button
          className={`icon-button save-button ${saved ? "is-saved" : ""}`}
          onClick={handleSave}
          aria-label={saved ? "Remove from saved" : "Save post"}
          aria-pressed={saved}
        >
          <Bookmark size={24} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="post-body">
        <p className="post-likes">
          <strong>{formatCount(likeCount)}</strong> {likeCount === 1 ? "like" : "likes"}
        </p>
        {post.caption && (
          <p className="post-caption">
            <strong>
              {post.authorName || "Anonymous"}
              {post.authorIsVerified && <VerifiedBadge size={13} />}
            </strong>{" "}
            {post.caption}
          </p>
        )}
        <button className="post-comment-count" onClick={() => onCommentClick?.(post)}>
          View all {formatCount(post.commentCount || 0)} comments
        </button>
      </div>

      {zoomOpen && (
        <Lightbox src={imageSrc} alt={post.caption || "Photo"} onClose={() => setZoomOpen(false)} />
      )}

      {editingCaption && (
        <EditCaptionModal
          initialCaption={post.caption || ""}
          onSave={handleSaveCaption}
          onClose={() => setEditingCaption(false)}
        />
      )}
    </article>
  );
}

function EditCaptionModal({ initialCaption, onSave, onClose }) {
  const [caption, setCaption] = useState(initialCaption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await onSave(caption);
    setBusy(false);
    if (result?.ok) {
      onClose();
    } else if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit caption">
        <header className="modal-card-header">
          <h3>Edit caption</h3>
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
            <button className="primary-button" onClick={handleSave} disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
