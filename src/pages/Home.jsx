import { useCallback, useEffect, useRef, useState } from "react";
import { Image, WifiOff, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PostCard from "../components/PostCard";
import CommentModal from "../components/CommentModal";
import Loading from "../components/Loading";
import StatusRail from "../components/StatusRail";
import useLivePost from "../hooks/useLivePost";
import { fetchFeedPosts, subscribeFeedPosts, fetchPost, fetchFollowingPrivatePosts, detectFeedIndexSupport } from "../services/posts";
import { hydratePostsAuthors } from "../services/users";
import { subscribeFollowingIds } from "../services/follows";

const FEED_LIVE_LIMIT = 8;

function PostSkeleton() {
  return (
    <div className="post-card skeleton-card">
      <div className="skeleton-line short" />
      <div className="skeleton-media" />
      <div className="skeleton-line" />
      <div className="skeleton-line half" />
    </div>
  );
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function feedErrorText(err) {
  if (isOffline()) return "You're offline. Check your internet connection and try again.";
  if (err?.code === "failed-precondition") {
    return "The feed needs a Firestore index that hasn't been deployed. Run: firebase deploy --only firestore";
  }
  if (err?.code === "permission-denied") {
    return "You don't have permission to view the feed. Try signing in again.";
  }
  const detail = err?.message ? ` (${err.message})` : "";
  return `Could not load the feed. Check your connection and try again.${detail}`;
}

export default function Home({ onOpenProfile }) {
  const { profile } = useAuth();
  const viewerUid = profile?.uid;
  const [posts, setPosts] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [activePost, setActivePost] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const sentinelRef = useRef(null);
  const loadedBeyondRef = useRef(false);

  // Live subscription to the newest public posts. Fires on every change (new
  // post, like, comment count, delete) so the feed updates without a reload.
  // Re-subscribes only when the user explicitly presses Retry (no auto-retry).
  // The composite-index probe decides between the indexed query and the
  // no-index fallback so the feed loads even before the index is deployed.
  useEffect(() => {
    setLoading(true);
    setError("");
    let unsub = () => {};
    let cancelled = false;
    detectFeedIndexSupport().finally(() => {
      if (cancelled) return;
      unsub = subscribeFeedPosts(
        FEED_LIVE_LIMIT,
        (live, lastDoc, removedIds) => {
          hydratePostsAuthors(live)
            .then(async (hydrated) => {
              const liveIds = new Set(hydrated.map((p) => p.id));
              // A document that left the live window may have been deleted or
              // just pushed out by a newer post. Verify before dropping it, so
              // realtime deletes vanish without losing posts that fell out of
              // the window (those are still reachable via pagination).
              const gone = new Set();
              for (const id of removedIds) {
                if (liveIds.has(id)) continue;
                try {
                  const post = await fetchPost(id);
                  if (!post || post.isPrivate === true) gone.add(id);
                } catch {
                  gone.add(id);
                }
              }
              setPosts((prev) => [
                ...hydrated,
                ...prev.filter((p) => !gone.has(p.id) && !liveIds.has(p.id)),
              ]);
              if (!loadedBeyondRef.current) {
                setCursor(lastDoc);
                setHasMore(Boolean(lastDoc) && hydrated.length === FEED_LIVE_LIMIT);
              }
              setLoading(false);
              setError("");
            })
            .catch((err) => {
              console.error("[Home] Feed posts failed to hydrate", err?.code, err?.message, err);
              setLoading(false);
              setError(feedErrorText(err));
            });
        },
        (err) => {
          // Keep the real Firebase reason visible during development.
          console.error("[Home] Feed subscription failed", err?.code, err?.message, err);
          setLoading(false);
          setError(feedErrorText(err));
        }
      );
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [retryKey]);

  // Live list of who the viewer follows, used to pull their private posts.
  useEffect(() => {
    if (!viewerUid) return;
    return subscribeFollowingIds(
      viewerUid,
      setFollowingIds,
      () => {}
    );
  }, [viewerUid]);

  // Merge private posts from approved-following accounts into the feed.
  useEffect(() => {
    if (!viewerUid || followingIds.length === 0) return;
    let active = true;
    fetchFollowingPrivatePosts(followingIds)
      .then((privatePosts) => {
        if (!active) return;
        return hydratePostsAuthors(privatePosts);
      })
      .then((hydrated = []) => {
        if (!active) return;
        setPosts((prev) => {
          const followingSet = new Set(followingIds);
          const byId = new Map();
          for (const p of [...hydrated, ...prev]) {
            // Private posts disappear the moment the viewer stops following.
            if (p.isPrivate && !followingSet.has(p.authorId)) continue;
            if (!byId.has(p.id)) byId.set(p.id, p);
          }
          return [...byId.values()].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        });
      })
      .catch((err) => {
        console.warn("[Home] Could not merge private posts", err?.code, err?.message, err);
      });
    return () => {
      active = false;
    };
  }, [viewerUid, followingIds]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const { posts: data, nextCursor } = await fetchFeedPosts(cursor);
      const hydrated = await hydratePostsAuthors(data);
      loadedBeyondRef.current = true;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...hydrated.filter((p) => !seen.has(p.id))];
      });
      setCursor(nextCursor);
      setHasMore(Boolean(nextCursor));
    } catch (err) {
      console.error("[Home] Load more failed", err?.code, err?.message, err);
      setLoadMoreError(
        isOffline()
          ? "You're offline. Check your internet connection and try again."
          : "Could not load more posts. Check your connection and try again."
      );
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, hasMore, loadingMore]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore, cursor]);

  const handleRetry = () => {
    loadedBeyondRef.current = false;
    setLoading(true);
    setError("");
    setLoadMoreError("");
    setPosts([]);
    setCursor(null);
    setHasMore(false);
    setRetryKey((k) => k + 1);
  };

  useEffect(() => {
    const onProfileUpdated = () => {
      if (posts.length === 0) return;
      hydratePostsAuthors(posts).then(setPosts).catch(() => {});
    };
    window.addEventListener("ps:profile-updated", onProfileUpdated);
    return () => window.removeEventListener("ps:profile-updated", onProfileUpdated);
  }, [posts]);

  const handlePostDeleted = (postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    if (activePost?.id === postId) setActivePost(null);
  };

  const liveActivePost = useLivePost(activePost?.id);
  const previewPost = liveActivePost === false ? null : liveActivePost || activePost;

  return (
    <div className="feed-page">
      <StatusRail />

      <div className="feed">
        {loading && (
          <>
            <PostSkeleton />
            <PostSkeleton />
          </>
        )}

        {!loading && error && (
          <div className="empty-state">
            <span className="empty-icon">
              <WifiOff size={40} />
            </span>
            <h2>Could not load the feed</h2>
            <p>{error}</p>
            <button className="primary-button" onClick={handleRetry}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">
              <Image size={40} />
            </span>
            <h2>No posts yet</h2>
            <p>Be the first to share a photo.</p>
            <button className="primary-button" onClick={() => window.dispatchEvent(new CustomEvent("ps:navigate", { detail: "create" }))}>
              Share a photo
            </button>
          </div>
        )}

        {!loading &&
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={profile}
              onCommentClick={setActivePost}
              onAuthorClick={onOpenProfile}
              onPostDeleted={handlePostDeleted}
            />
          ))}

        <div ref={sentinelRef} className="feed-sentinel">
          {loadingMore && <Loading size={24} />}
          {!loadingMore && loadMoreError && <p className="feed-load-more-error">{loadMoreError}</p>}
        </div>
      </div>

      {previewPost && activePost && (
        <CommentModal post={previewPost} currentUser={profile} onClose={() => setActivePost(null)} />
      )}
    </div>
  );
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}
