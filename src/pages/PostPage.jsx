import { useEffect, useState } from "react";
import { ArrowLeft, ImageOff, Home } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PostCard from "../components/PostCard";
import CommentModal from "../components/CommentModal";
import Loading from "../components/Loading";
import { fetchPostByShareCode, subscribePost } from "../services/posts";
import { hydratePostsAuthors } from "../services/users";

function goHome() {
  window.dispatchEvent(new CustomEvent("ps:navigate", { detail: "home" }));
}

/**
 * Single-post page reached via a shared link (/post/:code). Resolves the
 * random share code to a post and renders it as a standalone card, so the
 * link works on any device. Unknown or private (not permitted) codes show a
 * friendly empty state instead.
 */
export default function PostPage({ code, onOpenProfile }) {
  const { profile } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePost, setActivePost] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    setPost(null);
    setLoading(true);
    setError("");
    setActivePost(null);

    if (!code) {
      setLoading(false);
      setError("This share link is missing its post code.");
      return () => {};
    }

    fetchPostByShareCode(code)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setLoading(false);
          setError("This post is unavailable. It may have been deleted or set to private.");
          return;
        }
        return hydratePostsAuthors([found]).then(([hydrated]) => {
          if (cancelled) return;
          setPost(hydrated);
          setLoading(false);
          unsub = subscribePost(
            hydrated.id,
            (live) => {
              if (cancelled) return;
              if (live === false) {
                setPost(null);
                setLoading(false);
                setError("This post is unavailable. It may have been deleted or set to private.");
                return;
              }
              hydratePostsAuthors([live]).then(([liveHydrated]) => {
                if (!cancelled) setPost(liveHydrated);
              });
            },
            (err) => {
              console.error("[PostPage] Subscription failed", err?.code, err?.message, err);
            }
          );
        });
      })
      .catch((err) => {
        console.error("[PostPage] Lookup failed", err?.code, err?.message, err);
        if (cancelled) return;
        setLoading(false);
        setError("Could not load this post. Check your connection and try again.");
      });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [code]);

  const handlePostDeleted = (postId) => {
    if (post?.id === postId) {
      setPost(null);
      setError("This post is unavailable. It may have been deleted or set to private.");
    }
  };

  return (
    <div className="post-page">
      <div className="post-page-topbar">
        <button className="icon-button" onClick={goHome} aria-label="Back to home">
          <ArrowLeft size={22} />
        </button>
        <span className="post-page-title">Photo</span>
      </div>

      {loading && (
        <div className="post-page-state">
          <Loading size={28} />
        </div>
      )}

      {!loading && error && (
        <div className="empty-state">
          <span className="empty-icon">
            <ImageOff size={40} />
          </span>
          <h2>Photo not available</h2>
          <p>{error}</p>
          <button className="primary-button" onClick={goHome}>
            <Home size={16} /> Go home
          </button>
        </div>
      )}

      {!loading && !error && post && (
        <>
          <PostCard
            post={post}
            currentUser={profile}
            onCommentClick={setActivePost}
            onAuthorClick={onOpenProfile}
            onPostDeleted={handlePostDeleted}
          />
          {activePost && (
            <CommentModal post={activePost} currentUser={profile} onClose={() => setActivePost(null)} />
          )}
        </>
      )}
    </div>
  );
}
