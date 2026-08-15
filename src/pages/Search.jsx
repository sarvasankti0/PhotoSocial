import { useEffect, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import StatusAvatar from "../components/StatusAvatar";
import VerifiedBadge from "../components/VerifiedBadge";
import Loading from "../components/Loading";
import PostCard from "../components/PostCard";
import GridImage from "../components/GridImage";
import CommentModal from "../components/CommentModal";
import FollowButton from "../components/FollowButton";
import { useAuth } from "../context/AuthContext";
import useLivePost from "../hooks/useLivePost";
import { searchUsers, hydratePostsAuthors } from "../services/users";
import { searchPosts } from "../services/posts";
import { isVerified } from "../lib/verified";

export default function Search({ onOpenProfile }) {
  const { firebaseUser, profile } = useAuth();
  const [term, setTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [activePost, setActivePost] = useState(null);
  const [commentsPost, setCommentsPost] = useState(null);

  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed) {
      setUsers([]);
      setPosts([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const [userResults, postResults] = await Promise.all([searchUsers(trimmed), searchPosts(trimmed)]);
        const hydratedPosts = await hydratePostsAuthors(postResults);
        setUsers(userResults);
        setPosts(hydratedPosts);
        setSearched(true);
      } catch (err) {
        console.error("Search failed", err);
        setError("Search failed. Please try again.");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [term]);

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
    setActivePost(null);
  };

  const me = profile?.uid;
  const nothingFound = searched && users.length === 0 && posts.length === 0;

  return (
    <div className="search-page">
      <header className="search-head">
        <h1>Search</h1>
        <div className="search-input-wrap">
          <SearchIcon size={20} className="search-input-icon" />
          <input
            type="search"
            className="search-input"
            placeholder="Search people and photos..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Search people and posts"
          />
        </div>
      </header>

      {error && <div className="form-error">{error}</div>}

      {searching && (
        <div className="search-status">
          <Loading size={22} />
        </div>
      )}

      {!searching && !error && !term.trim() && (
        <div className="coming-soon">
          <span className="empty-icon">
            <SearchIcon size={40} />
          </span>
          <h2>Find people and photos</h2>
          <p>Search by username, account name or photo caption.</p>
        </div>
      )}

      {!searching && !error && nothingFound && (
        <div className="empty-state">
          <p>No people or photos found for “{term.trim()}”.</p>
        </div>
      )}

      {!searching && users.length > 0 && (
        <section className="search-section">
          <h2>People</h2>
          <ul className="search-results">
            {users.map((user) => (
              <li key={user.uid} className="search-result">
                <button className="search-result-main" onClick={() => onOpenProfile?.(user.uid)}>
                  <StatusAvatar
                    uid={user.uid}
                    src={user.photoURL}
                    alt={user.displayName}
                    name={user.displayName}
                    size={46}
                  />
                  <div className="search-result-meta">
                    <strong>
                      {user.displayName || "Unnamed user"}
                      {isVerified(user) && <VerifiedBadge size={15} />}
                    </strong>
                    <span>@{user.username || "user"}</span>
                  </div>
                </button>
                {user.uid !== me && (
                  <FollowButton
                    viewerUid={firebaseUser?.uid}
                    targetUid={user.uid}
                    actor={profile}
                    targetIsPrivate={Boolean(user.isPrivate)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!searching && posts.length > 0 && (
        <section className="search-section">
          <h2>Photos</h2>
          <div className="photo-grid search-photo-grid">
            {posts.map((post) => (
              <button
                key={post.id}
                className="grid-item"
                onClick={() => setActivePost(post)}
                aria-label="Open post"
              >
                <GridImage src={post.imageUrl} alt={post.caption || "Post"} />
              </button>
            ))}
          </div>
        </section>
      )}

      {activePost && (
        <div className="modal-overlay" onClick={() => setActivePost(null)}>
          <div className="post-preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="post-preview-close" onClick={() => setActivePost(null)} aria-label="Close">
              <X size={22} />
            </button>
            <LivePostPreview
              post={activePost}
              currentUser={profile}
              onClose={() => setActivePost(null)}
              onCommentClick={setCommentsPost}
              onOpenProfile={onOpenProfile}
              onDeleted={handlePostDeleted}
            />
          </div>
        </div>
      )}

      {commentsPost && (
        <CommentModal post={commentsPost} currentUser={profile} onClose={() => setCommentsPost(null)} />
      )}
    </div>
  );
}

function LivePostPreview({ post, currentUser, onClose, onCommentClick, onOpenProfile, onDeleted }) {
  const live = useLivePost(post?.id);
  const preview = live === false ? null : live || post;
  if (!preview) return null;
  return (
    <PostCard
      post={preview}
      currentUser={currentUser}
      onCommentClick={onCommentClick}
      onAuthorClick={(authorId) => {
        onClose();
        onOpenProfile?.(authorId);
      }}
      onPostDeleted={onDeleted}
    />
  );
}
