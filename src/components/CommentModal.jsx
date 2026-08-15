import { useEffect, useMemo, useState } from "react";
import { X, MessageCircle, Send, Heart, Pin, CornerUpLeft } from "lucide-react";
import StatusAvatar from "./StatusAvatar";
import Loading from "./Loading";
import { addComment, toggleCommentLove, setCommentPinned, subscribeComments } from "../services/comments";
import { notifyComment } from "../services/notifications";
import { validateComment } from "../lib/validators";
import { timeAgo, formatCount } from "../lib/format";

function sortComments(comments) {
  const byNewest = (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt);
  const pinned = comments.filter((c) => c.isPinned).sort(byNewest);
  const others = comments.filter((c) => !c.isPinned).sort(byNewest);
  return [...pinned, ...others];
}

function groupComments(comments) {
  const sorted = sortComments(comments);
  const ids = new Set(sorted.map((c) => c.id));
  const topLevel = sorted.filter((c) => !c.replyToId || !ids.has(c.replyToId));
  const repliesByParent = new Map();
  for (const c of sorted) {
    if (!c.replyToId || !ids.has(c.replyToId)) continue;
    if (!repliesByParent.has(c.replyToId)) repliesByParent.set(c.replyToId, []);
    repliesByParent.get(c.replyToId).push(c);
  }
  return { topLevel, repliesByParent };
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

export default function CommentModal({ post, currentUser, onClose }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);

  const isPostOwner = Boolean(currentUser && post.authorId === currentUser.uid);
  const uid = currentUser?.uid;

  const { topLevel, repliesByParent } = useMemo(() => groupComments(comments), [comments]);

  // Live comments: new comments, replies, loves and pins appear instantly.
  useEffect(() => {
    setLoading(true);
    setError("");
    const unsub = subscribeComments(
      post.id,
      100,
      (data) => {
        setComments(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
        setError("Could not load comments.");
      }
    );
    return () => unsub();
  }, [post.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser || posting) return;

    const check = validateComment(text);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setError("");
    setPosting(true);
    try {
      await addComment(post.id, {
        authorId: currentUser.uid,
        authorName: currentUser.displayName || currentUser.username || "Anonymous",
        authorPhotoURL: currentUser.photoURL || "",
        text: text.trim(),
        replyToId: replyTarget?.id || "",
        replyToName: replyTarget?.name || "",
      });
      notifyComment(currentUser, post, {
        isReply: Boolean(replyTarget?.id),
        text: text.trim(),
      });
      setText("");
      setReplyTarget(null);
    } catch (err) {
      console.error("Comment failed", err);
      setError("Could not post your comment. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const handleLove = async (comment) => {
    if (!uid) return;
    const loved = Array.isArray(comment.loves) && comment.loves.includes(uid);
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? {
              ...c,
              loves: loved ? (c.loves || []).filter((l) => l !== uid) : [...(c.loves || []), uid],
            }
          : c
      )
    );
    try {
      await toggleCommentLove(post.id, comment.id, uid, loved);
    } catch (err) {
      console.error("Love toggle failed", err);
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                loves: loved ? [...(c.loves || []), uid] : (c.loves || []).filter((l) => l !== uid),
              }
            : c
        )
      );
    }
  };

  const handlePin = async (comment) => {
    if (!isPostOwner) return;
    const next = !comment.isPinned;
    setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, isPinned: next } : c)));
    try {
      await setCommentPinned(post.id, comment.id, next);
    } catch (err) {
      console.error("Pin toggle failed", err);
      setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, isPinned: !next } : c)));
    }
  };

  const renderComment = (comment) => {
    const loved = Array.isArray(comment.loves) && comment.loves.includes(uid);
    const replies = repliesByParent.get(comment.id) || [];
    return (
      <div className={`comment-thread ${comment.isPinned ? "is-pinned" : ""}`} key={comment.id}>
        <div className="comment">
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
              {comment.authorId === post.authorId && <span className="comment-badge">Author</span>}
              {comment.isPinned && <span className="comment-badge pinned-badge"><Pin size={11} /> Pinned</span>}
              <span>{timeAgo(comment.createdAt)}</span>
            </div>
            <p className="comment-text">
              {comment.replyToName && (
                <span className="reply-to">@{comment.replyToName} </span>
              )}
              {comment.text}
            </p>
            <div className="comment-actions">
              <button
                className={`comment-action ${loved ? "is-loved" : ""}`}
                onClick={() => handleLove(comment)}
                aria-label={loved ? "Remove love" : "Love this comment"}
              >
                <Heart size={15} fill={loved ? "currentColor" : "none"} />
                {comment.loves?.length > 0 && <span>{formatCount(comment.loves.length)}</span>}
              </button>
              <button
                className="comment-action"
                onClick={() => setReplyTarget({ id: comment.id, name: comment.authorName })}
              >
                <CornerUpLeft size={15} /> Reply
              </button>
              {isPostOwner && (
                <button
                  className={`comment-action pin-action ${comment.isPinned ? "is-active" : ""}`}
                  onClick={() => handlePin(comment)}
                  title={comment.isPinned ? "Unpin comment" : "Pin comment"}
                  aria-label={comment.isPinned ? "Unpin comment" : "Pin comment"}
                >
                  <Pin size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {replies.length > 0 && (
          <div className="comment-replies">
            {replies.map(renderComment)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="comment-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Comments">
        <header className="comment-modal-header">
          <h3>{isPostOwner ? "Comments" : `${topLevel.length} comment${topLevel.length === 1 ? "" : "s"}`}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close comments">
            <X size={22} />
          </button>
        </header>

        <div className="comment-list">
          {loading && <Loading size={24} />}

          {!loading && topLevel.length === 0 && (
            <div className="empty-inline">
              <MessageCircle size={32} />
              <p>No comments yet. Start the conversation.</p>
            </div>
          )}

          {!loading && topLevel.map(renderComment)}

          {error && <div className="form-error">{error}</div>}
        </div>

        <form className="comment-form" onSubmit={handleSubmit}>
          <div className="comment-form-inner">
            {replyTarget && (
              <div className="reply-chip">
                Replying to <strong>@{replyTarget.name}</strong>
                <button type="button" onClick={() => setReplyTarget(null)} aria-label="Cancel reply">
                  <X size={14} />
                </button>
              </div>
            )}
            <div className="comment-form-row">
              <input
                className="comment-input"
                type="text"
                placeholder={replyTarget ? "Write a reply..." : "Add a comment..."}
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
