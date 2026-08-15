import { useEffect, useState } from "react";
import { X, MessageCircle, Send, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import StatusAvatar from "./StatusAvatar";
import Loading from "./Loading";
import { subscribeStatusComments, addStatusComment, deleteStatusComment } from "../services/statuses";
import { validateComment } from "../lib/validators";
import { timeAgo, formatCount } from "../lib/format";

/**
 * Comments for a single status. Anyone who can see the status can comment;
 * a comment can be deleted by its author or by the status owner.
 */
export default function StatusCommentModal({ authorUid, status, onClose }) {
  const { profile } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  const uid = profile?.uid;
  const isStatusOwner = Boolean(uid && authorUid === uid);

  useEffect(() => {
    setLoading(true);
    setError("");
    const unsub = subscribeStatusComments(
      authorUid,
      status.id,
      200,
      (data) => {
        setComments(data);
        setLoading(false);
      },
      (err) => {
        console.error("[Status] comments failed", err?.code, err?.message, err);
        setLoading(false);
        setError("Could not load comments.");
      }
    );
    return () => unsub();
  }, [authorUid, status.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!uid || posting) return;
    const check = validateComment(text);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError("");
    setPosting(true);
    try {
      await addStatusComment(authorUid, status.id, {
        authorId: uid,
        authorName: profile.displayName || profile.username || "Anonymous",
        authorPhotoURL: profile.photoURL || "",
        text: text.trim(),
      });
      setText("");
    } catch (err) {
      console.error("[Status] comment failed", err?.code, err?.message, err);
      setError("Could not post your comment. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (comment) => {
    if (!uid || posting) return;
    const allowed = comment.authorId === uid || isStatusOwner;
    if (!allowed) return;
    try {
      await deleteStatusComment(authorUid, status.id, comment.id);
    } catch (err) {
      console.error("[Status] comment delete failed", err?.code, err?.message, err);
    }
  };

  return (
    <div className="modal-overlay status-comment-overlay" onClick={onClose}>
      <div className="comment-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Status comments">
        <header className="comment-modal-header">
          <h3>
            {formatCount(status.commentCount || 0)} comment{status.commentCount === 1 ? "" : "s"}
          </h3>
          <button className="icon-button" onClick={onClose} aria-label="Close comments">
            <X size={22} />
          </button>
        </header>

        <div className="comment-list">
          {loading && <Loading size={24} />}

          {!loading && comments.length === 0 && (
            <div className="empty-inline">
              <MessageCircle size={32} />
              <p>No comments yet. Start the conversation.</p>
            </div>
          )}

          {!loading &&
            comments.map((comment) => {
              const canDelete = comment.authorId === uid || isStatusOwner;
              return (
                <div className="comment" key={comment.id}>
                  <StatusAvatar
                    uid={comment.authorId}
                    src={comment.authorPhotoURL}
                    alt={comment.authorName || "Commenter"}
                    name={comment.authorName}
                    size={34}
                  />
                  <div className="comment-body">
                    <div className="comment-meta">
                      <strong>{comment.authorName || "Anonymous"}</strong>
                      {comment.authorId === authorUid && <span className="comment-badge">Author</span>}
                      <span>{timeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="comment-text">{comment.text}</p>
                    {canDelete && (
                      <div className="comment-actions">
                        <button
                          className="comment-action"
                          onClick={() => handleDelete(comment)}
                          aria-label="Delete comment"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

          {error && <div className="form-error">{error}</div>}
        </div>

        <form className="comment-form" onSubmit={handleSubmit}>
          <div className="comment-form-inner">
            <div className="comment-form-row">
              <input
                className="comment-input"
                type="text"
                placeholder="Add a comment..."
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
                disabled={posting}
              />
              <button
                className="icon-button comment-send"
                type="submit"
                aria-label="Post comment"
                disabled={posting || !text.trim()}
              >
                {posting ? <Loading size={18} /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
