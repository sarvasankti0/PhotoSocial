import { useEffect, useRef, useState } from "react";
import {
  Grid3X3,
  Bookmark,
  Settings,
  Camera,
  X,
  Clock,
  Lock,
  Check,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";
import StatusAvatar from "../components/StatusAvatar";
import Loading from "../components/Loading";
import PostCard from "../components/PostCard";
import GridImage from "../components/GridImage";
import CommentModal from "../components/CommentModal";
import FollowButton from "../components/FollowButton";
import VerifiedBadge from "../components/VerifiedBadge";
import useFollowing from "../hooks/useFollowing";
import useLivePost from "../hooks/useLivePost";
import { updateUserProfile, updatePrivacySettings, hydratePostsAuthors, subscribeUser, fetchFollowers, fetchFollowing, removeFollower, fetchUsersByIds, setUserVerified } from "../services/users";
import { fetchPost, subscribeUserPosts } from "../services/posts";
import { subscribeSavedPosts } from "../services/saves";
import { subscribeFollowRequests, acceptFollowRequest, rejectFollowRequest } from "../services/follows";
import { notifyFollowAccepted } from "../services/notifications";
import { formatCount, formatDate } from "../lib/format";
import { imageToDataUrl } from "../lib/imageDataUrl";
import { isOfficialAccount, isVerified } from "../lib/verified";

export default function Profile({ profileId, onOpenProfile }) {
  const { firebaseUser, profile: me, refreshProfile } = useAuth();
  const isOwn = !profileId || profileId === me?.uid;
  const targetUid = isOwn ? me?.uid : profileId;

  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("posts");
  const [savedPosts, setSavedPosts] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [activePost, setActivePost] = useState(null);
  const [commentsPost, setCommentsPost] = useState(null);
  const [requests, setRequests] = useState([]);
  const [requestProfiles, setRequestProfiles] = useState([]);
  const [peopleModal, setPeopleModal] = useState(null); // { kind: "followers" | "following" }
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const viewerUid = firebaseUser?.uid;
  const { following, checked: followingChecked } = useFollowing(isOwn ? null : viewerUid, isOwn ? null : targetUid);

  // Only the official developer account can grant / revoke the verified tick.
  const canVerify = !isOwn && Boolean(viewerUid) && isOfficialAccount(me);

  const includePrivate = isOwn || following;

  // Live profile doc + posts: edits, counts and new photos update instantly.
  useEffect(() => {
    if (!targetUid) return;
    setLoading(true);
    setError("");
    const unsubs = [
      subscribeUser(
        targetUid,
        (u) => {
          setUser(u);
          setLoading(false);
        },
        () => {
          setError("Could not load this profile.");
          setLoading(false);
        }
      ),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [targetUid]);

  // Live posts. Private posts are included only when the viewer may see them.
  useEffect(() => {
    if (!targetUid) return;
    if (!isOwn && !followingChecked) return;
    const unsub = subscribeUserPosts(
      targetUid,
      12,
      includePrivate,
      (docs) => {
        hydratePostsAuthors(docs)
          .then(setPosts)
          .catch(() => {});
      },
      () => {}
    );
    return unsub;
  }, [targetUid, includePrivate, followingChecked, isOwn]);

  // Live saved posts (only when the Saved tab is open). A saved post whose
  // author later went private is dropped, mirroring the read rules.
  useEffect(() => {
    if (!isOwn || tab !== "saved" || !targetUid) return;
    let active = true;
    setSavedLoading(true);
    const unsub = subscribeSavedPosts(
      targetUid,
      20,
      async (ids) => {
        if (!active) return;
        try {
          const docs = [];
          for (const id of ids) {
            try {
              const post = await fetchPost(id);
              if (post) docs.push(post);
            } catch (err) {
              // No longer visible (e.g. author went private): skip it.
            }
          }
          const hydrated = await hydratePostsAuthors(docs);
          if (active) setSavedPosts(hydrated);
        } catch (err) {
          console.error("Saved posts load failed", err);
        } finally {
          if (active) setSavedLoading(false);
        }
      },
      () => {}
    );
    return () => {
      active = false;
      unsub();
    };
  }, [isOwn, tab, targetUid]);

  // Live pending follow requests (own profile only). Enrich with profiles.
  useEffect(() => {
    if (!isOwn || !targetUid) return;
    return subscribeFollowRequests(
      targetUid,
      async (list) => {
        setRequests(list);
        const ids = list.map((r) => r.id);
        if (ids.length === 0) {
          setRequestProfiles([]);
          return;
        }
        const profiles = await fetchUsersByIds(ids).catch(() => []);
        setRequestProfiles(profiles.filter(Boolean));
      },
      () => {}
    );
  }, [isOwn, targetUid]);

  const handlePostDeleted = (postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setSavedPosts((prev) => prev.filter((p) => p.id !== postId));
    setUser((u) => (u ? { ...u, postsCount: Math.max(0, (u.postsCount || 0) - 1) } : u));
    setActivePost(null);
  };

  const openPeople = async (kind) => {
    setPeopleModal({ kind });
    setPeople([]);
    setPeopleLoading(true);
    try {
      const list = kind === "followers" ? await fetchFollowers(targetUid) : await fetchFollowing(targetUid);
      setPeople(list);
    } catch (err) {
      console.error("People list failed", err);
    } finally {
      setPeopleLoading(false);
    }
  };

  const handleAcceptRequest = async (requesterUid) => {
    try {
      await acceptFollowRequest(targetUid, requesterUid);
      notifyFollowAccepted(me, requesterUid);
    } catch (err) {
      console.error("Accept failed", err);
    }
  };

  const handleRejectRequest = async (requesterUid) => {
    try {
      await rejectFollowRequest(targetUid, requesterUid);
    } catch (err) {
      console.error("Reject failed", err);
    }
  };

  const handleRemoveFollower = async (followerUid) => {
    try {
      await removeFollower(targetUid, followerUid);
      setPeople((prev) => prev.filter((p) => p.uid !== followerUid));
    } catch (err) {
      console.error("Remove follower failed", err);
    }
  };

  const handleToggleVerify = async () => {
    if (verifyBusy || !targetUid || !canVerify) return;
    setVerifyBusy(true);
    try {
      await setUserVerified(targetUid, !Boolean(user.isVerified));
    } catch (err) {
      console.error("Verify update failed", err?.code || err?.message, err);
      alert(err?.message || "Could not update verification.");
    } finally {
      setVerifyBusy(false);
    }
  };

  // Hooks must be called unconditionally and before any early return.
  const liveActivePost = useLivePost(activePost?.id);
  const previewPost = liveActivePost === false ? null : liveActivePost || activePost;

  if (loading) {
    return (
      <div className="profile-page">
        <Loading size={32} />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="empty-state">
        <p>{error || "Profile not found."}</p>
      </div>
    );
  }

  const gridPosts = tab === "saved" ? savedPosts : posts;

  const closePreview = () => setActivePost(null);

  const showFollowersStat = isOwn || user.showFollowersList !== false;
  const showFollowingStat = isOwn || user.showFollowingList !== false;

  const privateGateVisible = !isOwn && user.isPrivate && !following;

  return (
    <div className="profile-page">
      <section className="profile-card">
        <div className="profile-head">
          {isOwn ? (
            <Avatar
              src={me?.photoURL || user.photoURL}
              alt={user.displayName}
              size={88}
              className="profile-avatar"
            />
          ) : (
            <StatusAvatar
              uid={user.uid}
              src={user.photoURL}
              alt={user.displayName}
              name={user.displayName}
              size={88}
              className="profile-avatar"
            />
          )}

          <div className="profile-stats">
            <div className="stat">
              <strong>{formatCount(typeof user.postsCount === "number" ? user.postsCount : posts.length)}</strong>
              <span>posts</span>
            </div>
            {showFollowersStat ? (
              <button className="stat stat-button" onClick={() => openPeople("followers")}>
                <strong>{formatCount(user.followersCount || 0)}</strong>
                <span>followers</span>
              </button>
            ) : (
              <div className="stat">
                <strong>{formatCount(user.followersCount || 0)}</strong>
                <span>followers</span>
              </div>
            )}
            {showFollowingStat ? (
              <button className="stat stat-button" onClick={() => openPeople("following")}>
                <strong>{formatCount(user.followingCount || 0)}</strong>
                <span>following</span>
              </button>
            ) : (
              <div className="stat">
                <strong>{formatCount(user.followingCount || 0)}</strong>
                <span>following</span>
              </div>
            )}
          </div>
        </div>

        <div className="profile-identity">
          <h2>
            {user.displayName || "Unnamed user"}
            {isVerified(user) && <VerifiedBadge size={18} />}
            {user.isPrivate && (
              <span className="private-badge" title="Private account">
                <Lock size={13} /> Private
              </span>
            )}
          </h2>
          <p className="username">
            @{user.username || "user"}
            {isVerified(user) && <VerifiedBadge size={13} />}
          </p>
          {user.bio && <p className="bio">{user.bio}</p>}
          {user.createdAt && <p className="joined">Joined {formatDate(user.createdAt)}</p>}
        </div>

        <div className="profile-actions">
          {isOwn ? (
            <button className="secondary-button" onClick={() => setEditing(true)}>
              <Settings size={16} /> Edit profile
            </button>
          ) : (
            <FollowButton
              viewerUid={viewerUid}
              targetUid={targetUid}
              actor={me}
              targetIsPrivate={Boolean(user.isPrivate)}
            />
          )}

          {canVerify && (
            <button
              className={user.isVerified ? "secondary-button" : "primary-button verify-button"}
              onClick={handleToggleVerify}
              disabled={verifyBusy}
            >
              {verifyBusy ? (
                <Loading size={16} />
              ) : (
                <VerifiedBadge size={16} title={user.isVerified ? "Verified" : "Not verified"} />
              )}
              {user.isVerified ? "Unverify" : "Verify"}
            </button>
          )}
        </div>

        {isOwn && requests.length > 0 && (
          <div className="follow-requests">
            <div className="follow-requests-head">
              <Clock size={15} />
              <strong>Follow requests</strong>
              <span>{requests.length}</span>
            </div>
            <ul className="follow-requests-list">
              {requests.map((req) => {
                const requester = requestProfiles.find((p) => p.uid === req.id);
                return (
                  <li key={req.id} className="follow-request-row">
                    <StatusAvatar
                      uid={req.id}
                      src={requester?.photoURL}
                      alt={requester?.displayName || req.id}
                      name={requester?.displayName}
                      size={34}
                    />
                    <span className="follow-request-name">
                      {requester?.displayName || `@${requester?.username || req.id}`}
                      {isVerified(requester) && <VerifiedBadge size={13} />}
                    </span>
                    <button
                      className="accept-button"
                      onClick={() => handleAcceptRequest(req.id)}
                      aria-label={`Accept ${requester?.displayName || req.id}`}
                    >
                      <Check size={14} /> Accept
                    </button>
                    <button
                      className="reject-button"
                      onClick={() => handleRejectRequest(req.id)}
                      aria-label={`Reject ${requester?.displayName || req.id}`}
                    >
                      <X size={14} /> Reject
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="profile-tabs">
        <button className={`profile-tab ${tab === "posts" ? "is-active" : ""}`} onClick={() => setTab("posts")}>
          <Grid3X3 size={20} /> Posts
        </button>
        {isOwn && (
          <button className={`profile-tab ${tab === "saved" ? "is-active" : ""}`} onClick={() => setTab("saved")}>
            <Bookmark size={20} /> Saved
          </button>
        )}
      </section>

      {privateGateVisible ? (
        <div className="private-gate">
          <span className="empty-icon">
            <Lock size={40} />
          </span>
          <h2>This account is private</h2>
          <p>Follow {user.displayName || "this user"} to see their photos.</p>
          <FollowButton
            viewerUid={viewerUid}
            targetUid={targetUid}
            actor={me}
            targetIsPrivate
          />
        </div>
      ) : tab === "saved" && savedLoading ? (
        <div className="search-status">
          <Loading size={22} />
        </div>
      ) : (
        <>
          <section className="photo-grid">
            {gridPosts.map((post) => (
              <button key={post.id} className="grid-item" onClick={() => setActivePost(post)} aria-label="View post">
                <GridImage src={post.imageUrl} alt={post.caption || "Post"} />
              </button>
            ))}
          </section>

          {gridPosts.length === 0 && (
            <div className="empty-state small">
              {tab === "saved" ? (
                <>
                  <p>Nothing saved yet. Tap the bookmark on any post to keep it here.</p>
                </>
              ) : isOwn ? (
                <>
                  <p>You haven't shared any photos yet.</p>
                  <button
                    className="primary-button"
                    onClick={() => window.dispatchEvent(new CustomEvent("ps:navigate", { detail: "create" }))}
                  >
                    <Camera size={16} /> Share your first photo
                  </button>
                </>
              ) : (
                <p>No posts yet.</p>
              )}
            </div>
          )}
        </>
      )}

      {editing && (
        <EditProfileModal user={me} onClose={() => setEditing(false)} onSaved={refreshProfile} />
      )}

      {peopleModal && (
        <PeopleModal
          kind={peopleModal.kind}
          people={people}
          loading={peopleLoading}
          isOwn={isOwn}
          onClose={() => setPeopleModal(null)}
          onOpenProfile={(uid) => {
            setPeopleModal(null);
            onOpenProfile?.(uid);
          }}
          onRemoveFollower={handleRemoveFollower}
        />
      )}

      {activePost && previewPost && (
        <div className="modal-overlay" onClick={closePreview}>
          <div className="post-preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="post-preview-close" onClick={closePreview} aria-label="Close">
              <X size={22} />
            </button>
            <PostCard
              post={previewPost}
              currentUser={me}
              onCommentClick={setCommentsPost}
              onAuthorClick={() => {}}
              onPostDeleted={handlePostDeleted}
            />
          </div>
        </div>
      )}

      {commentsPost && (
        <CommentModal post={commentsPost} currentUser={me} onClose={() => setCommentsPost(null)} />
      )}
    </div>
  );
}

function PeopleModal({ kind, people, loading, isOwn, onClose, onOpenProfile, onRemoveFollower }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card people-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={kind}>
        <header className="modal-card-header">
          <h3>{kind === "followers" ? "Followers" : "Following"}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </header>
        <div className="modal-card-body">
          {loading && <Loading size={24} />}
          {!loading && people.length === 0 && <p className="muted-center">No one here yet.</p>}
          <ul className="people-list">
            {people.map((person) => (
              <li key={person.uid} className="people-row">
                <button className="people-main" onClick={() => onOpenProfile(person.uid)}>
                  <StatusAvatar
                    uid={person.uid}
                    src={person.photoURL}
                    alt={person.displayName}
                    name={person.displayName}
                    size={40}
                  />
                  <div className="people-meta">
                    <strong>
                      {person.displayName || "Unnamed user"}
                      {isVerified(person) && <VerifiedBadge size={14} />}
                    </strong>
                    <span>@{person.username || "user"}</span>
                  </div>
                </button>
                {isOwn && kind === "followers" && (
                  <button className="remove-follower" onClick={() => onRemoveFollower(person.uid)}>
                    <X size={14} /> Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function EditProfileModal({ user, onClose, onSaved }) {
  const { firebaseUser } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [isPrivate, setIsPrivate] = useState(Boolean(user?.isPrivate));
  const [allowDownloads, setAllowDownloads] = useState(user?.allowDownloads !== false);
  const [allowPerPostDownloads, setAllowPerPostDownloads] = useState(user?.allowPerPostDownloads !== false);
  const [followRequestNotifications, setFollowRequestNotifications] = useState(user?.followRequestNotifications !== false);
  const [showFollowersList, setShowFollowersList] = useState(user?.showFollowersList !== false);
  const [showFollowingList, setShowFollowingList] = useState(user?.showFollowingList !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const avatarInputRef = useRef(null);

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      setSaving(true);
      const { dataUrl } = await imageToDataUrl(file, "avatar");
      setPhotoURL(dataUrl);
    } catch (err) {
      console.error("Avatar prepare failed", err);
      setError(err.message || "Could not prepare your profile photo.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!firebaseUser || saving) return;
    setError("");
    setSaving(true);
    try {
      await updateUserProfile(firebaseUser.uid, { displayName, username, bio, photoURL });
      await updatePrivacySettings(firebaseUser.uid, {
        isPrivate,
        allowDownloads,
        allowPerPostDownloads,
        followRequestNotifications,
        showFollowersList,
        showFollowingList,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Profile update failed", err);
      setError(err.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit profile">
        <header className="modal-card-header">
          <h3>Edit profile</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </header>

        <div className="modal-card-body">
          <div className="avatar-picker">
            <Avatar src={photoURL} alt={displayName} size={72} />
            <button className="text-button" onClick={() => avatarInputRef.current?.click()}>
              <Camera size={16} /> Change photo
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
            <input value={displayName} maxLength={50} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
          </label>

          <label className="field">
            <span>Username</span>
            <input value={username} maxLength={30} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          </label>

          <label className="field">
            <span>Bio</span>
            <textarea value={bio} maxLength={150} rows={3} onChange={(e) => setBio(e.target.value)} placeholder="Tell people about yourself" />
            <span className="char-count">{bio.length}/150</span>
          </label>

          <div className="privacy-section">
            <h4>Privacy &amp; permissions</h4>

            <ToggleRow
              label="Private account"
              hint="Only followers you approve can see your posts."
              checked={isPrivate}
              onChange={setIsPrivate}
            />
            <ToggleRow
              label="Allow downloads"
              hint="Let others save a copy of your photos."
              checked={allowDownloads}
              onChange={setAllowDownloads}
            />
            <ToggleRow
              label="Per-post download control"
              hint="Add a download toggle to each of your posts."
              checked={allowPerPostDownloads}
              onChange={setAllowPerPostDownloads}
            />
            <ToggleRow
              label="Notify me about follow requests"
              hint="Get an activity alert when someone asks to follow you."
              checked={followRequestNotifications}
              onChange={setFollowRequestNotifications}
            />
            <ToggleRow
              label="Show my followers list"
              checked={showFollowersList}
              onChange={setShowFollowersList}
            />
            <ToggleRow
              label="Show my following list"
              checked={showFollowingList}
              onChange={setShowFollowingList}
            />
          </div>

          <button className="primary-button" onClick={handleSave} disabled={saving}>
            {saving ? <Loading size={18} /> : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <label className="setting-row">
      <div className="setting-text">
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <span className={`toggle ${checked ? "is-on" : ""}`} role="switch" aria-checked={checked}>
        <span className="toggle-knob" />
      </span>
      <input
        type="checkbox"
        className="hidden-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
