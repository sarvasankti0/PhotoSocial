import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  subscribeFollowingStatuses,
  subscribeOwnStatuses,
  isStatusActive,
} from "../services/statuses";
import { subscribeFollowingIds } from "../services/follows";
import StatusViewer from "../components/StatusViewer";
import Lightbox from "../components/Lightbox";

const StatusContext = createContext(null);

export function useStatus() {
  return useContext(StatusContext);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

/**
 * App-wide status feature provider. Maintains the live list of active
 * (24-hour) statuses grouped by author. A user sees their own statuses plus
 * the statuses of the accounts they follow (both public and private — that
 * mirrors the rest of the app's privacy model), and nothing else. Renders the
 * full-screen story viewer / avatar lightbox.
 */
export function StatusProvider({ children }) {
  const { firebaseUser } = useAuth();
  const viewerUid = firebaseUser?.uid;

  const [followingStatuses, setFollowingStatuses] = useState([]);
  const [ownStatuses, setOwnStatuses] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [viewingIndex, setViewingIndex] = useState(-1);
  const [avatarView, setAvatarView] = useState(null); // { src, name }

  // Periodic tick so expired statuses leave the rail without a reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Approved following list — the rail only surfaces statuses from accounts
  // the viewer follows (mirroring the rest of the app's privacy model).
  useEffect(() => {
    if (!viewerUid) return;
    return subscribeFollowingIds(
      viewerUid,
      setFollowingIds,
      (err) => console.error("[Status] following subscription failed", err?.code, err?.message, err)
    );
  }, [viewerUid]);

  // Statuses of every followed account (public + private, one listener each).
  useEffect(() => {
    if (!viewerUid || followingIds.length === 0) return;
    return subscribeFollowingStatuses(
      followingIds,
      setFollowingStatuses,
      (err) => console.error("[Status] followed-status subscription failed", err?.code, err?.message, err)
    );
  }, [viewerUid, followingIds]);

  // The viewer's own statuses (public + private).
  useEffect(() => {
    if (!viewerUid) return;
    return subscribeOwnStatuses(
      viewerUid,
      setOwnStatuses,
      (err) => console.error("[Status] own status subscription failed", err?.code, err?.message, err)
    );
  }, [viewerUid]);

  // Merge the two slices, deduped by author+id (own statuses win over the
  // followed snapshot they also appear in when the account is public).
  const rawStatuses = useMemo(() => {
    const byKey = new Map();
    const add = (list) => {
      for (const s of list) byKey.set(`${s.authorId}:${s.id}`, s);
    };
    add(followingStatuses);
    add(ownStatuses);
    return [...byKey.values()];
  }, [followingStatuses, ownStatuses]);

  // Group active statuses by author. A user with several active statuses keeps
  // all of them; the rail shows one circle per author and the viewer plays
  // their statuses in sequence.
  const groups = useMemo(() => {
    const byAuthor = new Map();
    for (const s of rawStatuses) {
      if (!isStatusActive(s, now)) continue;
      if (s.authorId === viewerUid) {
        // always visible to the author
      } else if (!followingIds.includes(s.authorId)) {
        // Safety net: only followed accounts reach the rail (a just-unfollowed
        // user's statuses may still be in the subscription buffer).
        continue;
      }
      let group = byAuthor.get(s.authorId);
      if (!group) {
        group = {
          uid: s.authorId,
          authorName: s.authorName || "User",
          authorPhotoURL: s.authorPhotoURL || "",
          isPrivate: Boolean(s.isPrivate),
          statuses: [],
        };
        byAuthor.set(s.authorId, group);
      }
      group.statuses.push(s);
    }
    const list = [...byAuthor.values()];
    for (const g of list) {
      g.statuses.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    }
    list.sort((a, b) => toMillis(b.statuses[0]?.createdAt) - toMillis(a.statuses[0]?.createdAt));
    return list;
  }, [rawStatuses, followingIds, viewerUid, now]);

  // Flattened slide list for the viewer (one slide per status).
  const slides = useMemo(() => groups.flatMap((g) => g.statuses.map((s) => ({ uid: g.uid, status: s }))), [groups]);

  const statusOf = useCallback(
    (uid) => {
      if (!uid) return null;
      return groups.find((g) => g.uid === uid) || null;
    },
    [groups]
  );

  const viewStatus = useCallback(
    (uid) => {
      if (!uid) return;
      const i = slides.findIndex((s) => s.uid === uid);
      if (i >= 0) setViewingIndex(i);
    },
    [slides]
  );

  const viewAvatar = useCallback((src, name) => {
    if (!src) return;
    setAvatarView({ src, name: name || "Profile picture" });
  }, []);

  const safeIndex = slides.length > 0 ? Math.min(viewingIndex, slides.length - 1) : -1;
  const activeViewer = safeIndex >= 0;

  return (
    <StatusContext.Provider value={{ statuses: groups, statusOf, viewStatus, viewAvatar }}>
      {children}

      {avatarView && (
        <Lightbox src={avatarView.src} alt={avatarView.name} onClose={() => setAvatarView(null)} />
      )}

      {activeViewer && (
        <StatusViewer
          slides={slides}
          index={safeIndex}
          viewerUid={viewerUid}
          onClose={() => setViewingIndex(-1)}
          onNavigate={(i) => setViewingIndex(i)}
        />
      )}
    </StatusContext.Provider>
  );
}
