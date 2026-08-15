import { useEffect, useState } from "react";
import { Bell, Heart, MessageCircle, UserPlus, CornerUpLeft, Clock, Check, X } from "lucide-react";
import StatusAvatar from "../components/StatusAvatar";
import Loading from "../components/Loading";
import { useAuth } from "../context/AuthContext";
import {
  subscribeNotifications,
  markNotificationsRead,
  deleteNotification,
} from "../services/notifications";
import { acceptFollowRequest, rejectFollowRequest } from "../services/follows";
import { notifyFollowAccepted } from "../services/notifications";
import { timeAgo } from "../lib/format";

const TYPE_ICON = {
  follow: { Icon: UserPlus, className: "is-follow" },
  follow_request: { Icon: Clock, className: "is-follow" },
  follow_accepted: { Icon: UserPlus, className: "is-follow" },
  like: { Icon: Heart, className: "is-like" },
  comment: { Icon: MessageCircle, className: "is-comment" },
  reply: { Icon: CornerUpLeft, className: "is-comment" },
};

export default function Activity({ onOpenProfile }) {
  const { firebaseUser, profile: me } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!firebaseUser) return;
    let firstLoad = true;

    const unsub = subscribeNotifications(
      firebaseUser.uid,
      30,
      (list) => {
        setItems(list);
        setError("");
        setLoading(false);
        if (firstLoad) {
          firstLoad = false;
          const unreadIds = list.filter((n) => !n.read).map((n) => n.id);
          if (unreadIds.length > 0) {
            markNotificationsRead(firebaseUser.uid, unreadIds)
              .then(() => {
                setItems((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n)));
                window.dispatchEvent(new CustomEvent("ps:notifications-updated"));
              })
              .catch(() => {});
          }
        }
      },
      (err) => {
        console.error("Activity load failed", err);
        setLoading(false);
        setError("Could not load your activity.");
      }
    );

    return () => unsub();
  }, [firebaseUser]);

  const unreadCount = items.filter((n) => !n.read).length;

  const messageFor = (n) => {
    const name = n.actorName || "Someone";
    const snippet = n.snippet ? ` “${n.snippet}”` : "";
    switch (n.type) {
      case "follow":
        return (
          <span>
            <strong>{name}</strong> started following you.
          </span>
        );
      case "follow_request":
        return (
          <span>
            <strong>{name}</strong> requested to follow you.
          </span>
        );
      case "follow_accepted":
        return (
          <span>
            <strong>{name}</strong> accepted your follow request.
          </span>
        );
      case "like":
        return (
          <span>
            <strong>{name}</strong> liked your photo{snippet}.
          </span>
        );
      case "reply":
        return (
          <span>
            <strong>{name}</strong> replied to a comment{snippet}.
          </span>
        );
      case "comment":
      default:
        return (
          <span>
            <strong>{name}</strong> commented on your photo{snippet}.
          </span>
        );
    }
  };

  const handleResolveRequest = async (item, accept) => {
    if (!firebaseUser || busyId) return;
    setBusyId(item.id);
    try {
      if (accept) {
        await acceptFollowRequest(firebaseUser.uid, item.actorId);
        notifyFollowAccepted(me, item.actorId);
      } else {
        await rejectFollowRequest(firebaseUser.uid, item.actorId);
      }
      await deleteNotification(firebaseUser.uid, item.id);
      setItems((prev) => prev.filter((n) => n.id !== item.id));
    } catch (err) {
      console.error("Follow request resolve failed", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="activity-page">
      <header className="activity-head">
        <h1>Activity</h1>
        {unreadCount > 0 && (
          <span className="activity-unread-count">
            {unreadCount} new
          </span>
        )}
      </header>

      {loading && (
        <div className="activity-loading">
          <Loading size={26} />
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="coming-soon">
          <span className="empty-icon">
            <Bell size={40} />
          </span>
          <h2>No activity yet</h2>
          <p>Likes, comments and follows on your photos will appear here.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="activity-list">
          {items.map((n) => {
            const { Icon, className } = TYPE_ICON[n.type] || TYPE_ICON.comment;
            return (
              <li key={n.id} className={`activity-item ${n.read ? "" : "is-unread"}`}>
                <button className="activity-actor" onClick={() => onOpenProfile?.(n.actorId)} aria-label={`View ${n.actorName || "user"}'s profile`}>
                  <StatusAvatar
                    uid={n.actorId}
                    src={n.actorPhotoURL}
                    alt={n.actorName}
                    name={n.actorName}
                    size={42}
                  />
                </button>
                <span className={`activity-icon ${className}`}>
                  <Icon size={16} />
                </span>
                <div className="activity-body">
                  <p className="activity-text">{messageFor(n)}</p>
                  <span className="activity-time">{timeAgo(n.createdAt)}</span>
                  {n.type === "follow_request" && (
                    <div className="activity-actions">
                      <button
                        className="accept-button"
                        onClick={() => handleResolveRequest(n, true)}
                        disabled={busyId === n.id}
                      >
                        <Check size={14} /> Accept
                      </button>
                      <button
                        className="reject-button"
                        onClick={() => handleResolveRequest(n, false)}
                        disabled={busyId === n.id}
                      >
                        <X size={14} /> Decline
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
