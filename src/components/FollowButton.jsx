import { useEffect, useState } from "react";
import { UserPlus, UserCheck, Clock, Loader2 } from "lucide-react";
import useFollowing from "../hooks/useFollowing";
import {
  followUser,
  unfollowUser,
  cancelFollowRequest,
  subscribeFollowRequest,
} from "../services/follows";
import { notifyFollow, notifyFollowRequest } from "../services/notifications";

/**
 * Follow button that handles the full private-account flow:
 * - Public account: Follow / Following
 * - Private account: sends a follow request -> "Requested" (click to cancel)
 *
 * @param {object} props
 * @param {string} props.viewerUid - signed-in user's uid
 * @param {string} props.targetUid - the account being followed
 * @param {object} [props.actor] - signed-in user's profile (for notifications)
 * @param {boolean} [props.targetIsPrivate]
 * @param {string} [props.className]
 */
export default function FollowButton({ viewerUid, targetUid, actor, targetIsPrivate, className = "" }) {
  const { following, checked } = useFollowing(viewerUid, targetUid);
  const [requested, setRequested] = useState(false);
  const [requestChecked, setRequestChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!viewerUid || !targetUid || viewerUid === targetUid) {
      setRequested(false);
      setRequestChecked(false);
      return;
    }
    return subscribeFollowRequest(
      viewerUid,
      targetUid,
      (pending) => {
        setRequested(pending);
        setRequestChecked(true);
      },
      () => {}
    );
  }, [viewerUid, targetUid]);

  const handleClick = async () => {
    if (!viewerUid || busy) return;
    setBusy(true);
    try {
      if (following) {
        await unfollowUser(viewerUid, targetUid);
      } else if (requested) {
        await cancelFollowRequest(viewerUid, targetUid);
      } else if (targetIsPrivate) {
        await followUser(viewerUid, targetUid, { isPrivate: true });
        notifyFollowRequest(actor, targetUid);
      } else {
        await followUser(viewerUid, targetUid, { isPrivate: false });
        notifyFollow(actor, targetUid);
      }
    } catch (err) {
      console.error("Follow action failed", err);
    } finally {
      setBusy(false);
    }
  };

  const isReady = checked && (requestChecked || !targetIsPrivate);
  if (!isReady) {
    return <span className={`follow-placeholder ${className}`} />;
  }

  const label = following ? "Following" : requested ? "Requested" : "Follow";

  return (
    <button
      className={`follow-button ${className} ${following ? "is-following" : ""} ${requested ? "is-requested" : ""}`}
      onClick={handleClick}
      disabled={busy}
      aria-label={label}
      aria-pressed={following}
    >
      {busy ? (
        <Loader2 size={16} className="spin" />
      ) : following ? (
        <UserCheck size={16} />
      ) : requested ? (
        <Clock size={16} />
      ) : (
        <UserPlus size={16} />
      )}
      {label}
    </button>
  );
}
