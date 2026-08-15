import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  collection,
  query,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { adjustUserCount } from "./users";

function followingRef(followerUid, targetUid) {
  return doc(db, "users", followerUid, "following", targetUid);
}

function followersRef(ownerUid, followerUid) {
  return doc(db, "users", ownerUid, "followers", followerUid);
}

export function followRequestDoc(targetUid, requesterUid) {
  return doc(db, "users", targetUid, "followRequests", requesterUid);
}

/**
 * Follow a user, or request to follow a private account.
 *
 * - Public account: follows immediately (both relation docs + counters).
 * - Private account: creates a follow request; the owner must accept it.
 *
 * @param {string} followerUid - the signed-in user
 * @param {string} targetUid - the user being followed
 * @param {object} [targetProfile] - the target's profile (isPrivate check)
 * @returns {Promise<{ requested: boolean }>}
 */
export async function followUser(followerUid, targetUid, targetProfile) {
  if (followerUid === targetUid) throw new Error("You cannot follow yourself.");

  const profile = targetProfile || (await getDoc(doc(db, "users", targetUid))).data() || {};
  if (profile.isPrivate) {
    await setDoc(followRequestDoc(targetUid, followerUid), {
      createdAt: serverTimestamp(),
      read: false,
    });
    return { requested: true };
  }

  await setDoc(followingRef(followerUid, targetUid), { followedAt: serverTimestamp() });
  await setDoc(followersRef(targetUid, followerUid), { followedAt: serverTimestamp() });
  await adjustUserCount(followerUid, "followingCount", 1);
  await adjustUserCount(targetUid, "followersCount", 1);
  return { requested: false };
}

/**
 * Accept a pending follow request. Creates the follow relations, bumps the
 * counters and deletes the request.
 * @param {string} ownerUid - the private account owner
 * @param {string} requesterUid - the approved user
 */
export async function acceptFollowRequest(ownerUid, requesterUid) {
  await deleteDoc(followRequestDoc(ownerUid, requesterUid));
  await setDoc(followingRef(requesterUid, ownerUid), { followedAt: serverTimestamp() });
  await setDoc(followersRef(ownerUid, requesterUid), { followedAt: serverTimestamp() });
  await adjustUserCount(requesterUid, "followingCount", 1);
  await adjustUserCount(ownerUid, "followersCount", 1);
}

/**
 * Reject/delete a follow request without creating any relation.
 * @param {string} ownerUid
 * @param {string} requesterUid
 */
export async function rejectFollowRequest(ownerUid, requesterUid) {
  await deleteDoc(followRequestDoc(ownerUid, requesterUid));
}

/**
 * Cancel a follow request the user sent to a private account.
 * @param {string} requesterUid
 * @param {string} targetUid
 */
export async function cancelFollowRequest(requesterUid, targetUid) {
  await deleteDoc(followRequestDoc(targetUid, requesterUid));
}

/**
 * Unfollow a user (and drop any pending follow request).
 * @param {string} followerUid
 * @param {string} targetUid
 */
export async function unfollowUser(followerUid, targetUid) {
  if (followerUid === targetUid) return;
  await deleteDoc(followingRef(followerUid, targetUid));
  await deleteDoc(followersRef(targetUid, followerUid));
  await deleteDoc(followRequestDoc(targetUid, followerUid)).catch(() => {});
  await adjustUserCount(followerUid, "followingCount", -1);
  await adjustUserCount(targetUid, "followersCount", -1);
}

/**
 * Check whether `viewerUid` is following `targetUid`.
 * @param {string} viewerUid
 * @param {string} targetUid
 */
export async function isFollowing(viewerUid, targetUid) {
  if (!viewerUid || !targetUid || viewerUid === targetUid) return false;
  const snapshot = await getDoc(followingRef(viewerUid, targetUid));
  return snapshot.exists();
}

/**
 * Live subscription to whether `viewerUid` is following `targetUid`.
 * @param {string} viewerUid
 * @param {string} targetUid
 * @param {(isFollowing: boolean) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeFollowing(viewerUid, targetUid, onNext, onError) {
  if (!viewerUid || !targetUid || viewerUid === targetUid) return () => {};
  return onSnapshot(
    followingRef(viewerUid, targetUid),
    (snap) => onNext(snap.exists()),
    onError
  );
}

/**
 * Live subscription to whether `requesterUid` has a pending follow request
 * with `targetUid`.
 * @param {string} requesterUid
 * @param {string} targetUid
 * @param {(pending: boolean) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeFollowRequest(requesterUid, targetUid, onNext, onError) {
  if (!requesterUid || !targetUid) return () => {};
  return onSnapshot(
    followRequestDoc(targetUid, requesterUid),
    (snap) => onNext(snap.exists()),
    onError
  );
}

/**
 * Live subscription to a user's approved following list (the set of ids they
 * follow). Used for realtime visibility checks.
 * @param {string} uid
 * @param {(ids: string[]) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeFollowingIds(uid, onNext, onError) {
  if (!uid) return () => {};
  const q = query(collection(db, "users", uid, "following"), limit(500));
  return onSnapshot(
    q,
    (snap) => onNext(snap.docs.map((d) => d.id)),
    onError
  );
}

/**
 * Live subscription to a user's pending follow requests (owner only).
 * @param {string} ownerUid
 * @param {(requests: Array) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeFollowRequests(ownerUid, onNext, onError) {
  if (!ownerUid) return () => {};
  const q = query(collection(db, "users", ownerUid, "followRequests"), limit(100));
  return onSnapshot(
    q,
    (snap) => onNext(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}
