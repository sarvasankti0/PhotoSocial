import {
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  addDoc,
  doc,
  writeBatch,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

export function notificationsCollection(uid) {
  return collection(db, "users", uid, "notifications");
}

export function notificationDoc(uid, notifId) {
  return doc(db, "users", uid, "notifications", notifId);
}

function toActor(profile) {
  if (!profile) return null;
  return {
    actorId: profile.uid,
    actorName: profile.displayName || profile.username || "Anonymous",
    actorPhotoURL: profile.photoURL || "",
  };
}

async function createNotification({ type, recipientUid, actor, postId = "", snippet = "" }) {
  if (!recipientUid || !actor?.actorId) return;
  if (recipientUid === actor.actorId) return;

  try {
    await addDoc(notificationsCollection(recipientUid), {
      type,
      actorId: actor.actorId,
      actorName: actor.actorName,
      actorPhotoURL: actor.actorPhotoURL,
      postId,
      snippet,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Notification could not be saved", err);
  }
}

/**
 * Notify a user that someone followed them.
 * @param {object} actor - the signed-in user profile
 * @param {string} recipientUid - the user who was followed
 */
export async function notifyFollow(actor, recipientUid) {
  await createNotification({ type: "follow", recipientUid, actor: toActor(actor) });
}

/**
 * Notify a post author that their post was liked.
 * @param {object} actor - the signed-in user profile
 * @param {object} post - the post that was liked
 */
export async function notifyPostLike(actor, post) {
  if (!post) return;
  await createNotification({
    type: "like",
    recipientUid: post.authorId,
    actor: toActor(actor),
    postId: post.id,
    snippet: (post.caption || "").slice(0, 60),
  });
}

/**
 * Notify a post author that someone commented (or replied) on their post.
 * @param {object} actor - the signed-in user profile
 * @param {object} post - the post that received the comment
 * @param {{ isReply?: boolean, text?: string }} [options]
 */
export async function notifyComment(actor, post, { isReply = false, text = "" } = {}) {
  if (!post) return;
  await createNotification({
    type: isReply ? "reply" : "comment",
    recipientUid: post.authorId,
    actor: toActor(actor),
    postId: post.id,
    snippet: (text || "").slice(0, 80),
  });
}

/**
 * Notify a private-account owner that someone requested to follow them.
 * @param {object} actor - the signed-in user profile
 * @param {string} recipientUid - the private account owner
 */
export async function notifyFollowRequest(actor, recipientUid) {
  await createNotification({ type: "follow_request", recipientUid, actor: toActor(actor) });
}

/**
 * Notify a user that their follow request was accepted.
 * @param {object} actor - the account owner who accepted
 * @param {string} recipientUid - the requester
 */
export async function notifyFollowAccepted(actor, recipientUid) {
  await createNotification({ type: "follow_accepted", recipientUid, actor: toActor(actor) });
}

/**
 * Fetch a user's notifications, newest first.
 * @param {string} uid
 * @param {number} max
 */
export async function fetchNotifications(uid, max = 30) {
  if (!uid) return [];
  const q = query(notificationsCollection(uid), orderBy("createdAt", "desc"), limit(max));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * Mark a batch of notifications as read.
 * @param {string} uid
 * @param {string[]} ids
 */
export async function markNotificationsRead(uid, ids) {
  if (!uid || !ids || ids.length === 0) return;
  const batch = writeBatch(db);
  for (const id of ids) {
    batch.update(notificationDoc(uid, id), { read: true });
  }
  await batch.commit();
}

/**
 * Live subscription to a user's notifications, newest first. Fires immediately
 * with the current list and again whenever anything changes.
 * @param {string} uid
 * @param {number} max
 * @param {(items: Array) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeNotifications(uid, max, onNext, onError) {
  if (!uid) return () => {};
  const q = query(notificationsCollection(uid), orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => onNext(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))),
    onError
  );
}

/**
 * Delete a notification (e.g. a follow request that was resolved).
 * @param {string} uid
 * @param {string} notifId
 */
export async function deleteNotification(uid, notifId) {
  if (!uid || !notifId) return;
  await deleteDoc(notificationDoc(uid, notifId));
}

/**
 * Live unread-notification count for the badge.
 * @param {string} uid
 * @param {(count: number) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeUnreadCount(uid, onNext, onError) {
  if (!uid) return () => {};
  const q = query(notificationsCollection(uid), where("read", "==", false), limit(30));
  return onSnapshot(q, (snap) => onNext(snap.size), onError);
}
