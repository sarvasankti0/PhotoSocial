import {
  collection,
  query,
  where,
  orderBy,
  limit,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * 24-hour statuses (stories). Each status is its own document under the
 * author's `users/{uid}/statuses/{statusId}` sub-collection, so a user can
 * post multiple statuses and every one stays visible for 24 hours. The status
 * doc denormalizes the author's name/photo (like posts) and carries its own
 * expiry. A viewer discovers active statuses by reading the `users/{uid}/statuses`
 * sub-collection of the accounts they follow, plus their own.
 */

export const STATUS_DURATION_MS = 24 * 60 * 60 * 1000;

export function statusesCollection(uid) {
  return collection(db, "users", uid, "statuses");
}

/**
 * Whether a status is still within its 24-hour window.
 * @param {{ expiresAt?: import("firebase/firestore").Timestamp | Date | number } | null | undefined} status
 * @param {number} [now] epoch millis
 */
export function isStatusActive(status, now = Date.now()) {
  if (!status || !status.expiresAt) return false;
  const expiry =
    typeof status.expiresAt.toMillis === "function"
      ? status.expiresAt.toMillis()
      : status.expiresAt instanceof Date
        ? status.expiresAt.getTime()
        : status.expiresAt;
  return Number(expiry) > now;
}

function statusFields({ imageUrl, caption = "", isPrivate = false, authorName = "", authorPhotoURL = "" }) {
  return {
    authorId: "",
    authorName,
    authorPhotoURL: authorPhotoURL || "",
    imageUrl,
    caption: caption || "",
    isPrivate: Boolean(isPrivate),
    likes: [],
    commentCount: 0,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + STATUS_DURATION_MS),
  };
}

/**
 * Publish a new status for the current user.
 * @param {string} uid
 * @param {{ imageUrl: string, caption?: string, isPrivate?: boolean, authorName?: string, authorPhotoURL?: string }} data
 * @returns {Promise<string>} new status id
 */
export async function addStatus(uid, data) {
  if (!uid || !data?.imageUrl) return "";
  const ref = await addDoc(statusesCollection(uid), {
    ...statusFields(data),
    authorId: uid,
  });
  return ref.id;
}

/**
 * Edit a status (owner only). Updating `imageUrl` or `caption` extends nothing;
 * the original 24-hour window is preserved.
 * @param {string} uid
 * @param {string} statusId
 * @param {{ imageUrl?: string, caption?: string }} fields
 */
export async function updateStatus(uid, statusId, fields) {
  if (!uid || !statusId) return;
  const clean = {};
  if (fields.imageUrl !== undefined) clean.imageUrl = fields.imageUrl;
  if (fields.caption !== undefined) clean.caption = fields.caption;
  if (Object.keys(clean).length === 0) return;
  await updateDoc(doc(collection(db, "users", uid, "statuses"), statusId), clean);
}

/**
 * Delete a status (owner only).
 * @param {string} uid
 * @param {string} statusId
 */
export async function deleteStatus(uid, statusId) {
  if (!uid || !statusId) return;
  await deleteDoc(doc(collection(db, "users", uid, "statuses"), statusId));
}

export function statusDoc(uid, statusId) {
  return doc(collection(db, "users", uid, "statuses"), statusId);
}

/**
 * Toggle the like state for a status using atomic array operations. Anyone who
 * can see the status may like it.
 * @param {string} authorUid
 * @param {string} statusId
 * @param {string} uid
 * @param {boolean} currentlyLiked
 */
export async function toggleStatusLike(authorUid, statusId, uid, currentlyLiked) {
  if (!authorUid || !statusId || !uid) return;
  const ref = statusDoc(authorUid, statusId);
  if (currentlyLiked) {
    await updateDoc(ref, { likes: arrayRemove(uid) });
  } else {
    await updateDoc(ref, { likes: arrayUnion(uid) });
  }
}

export function isStatusLikedBy(status, uid) {
  return Boolean(uid && Array.isArray(status?.likes) && status.likes.includes(uid));
}

export function statusCommentsCollection(authorUid, statusId) {
  return collection(db, "users", authorUid, "statuses", statusId, "comments");
}

/**
 * Live subscription to a status's comments, newest first.
 * @param {string} authorUid
 * @param {string} statusId
 * @param {number} count
 * @param {(comments: Array) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeStatusComments(authorUid, statusId, count, onNext, onError) {
  if (!authorUid || !statusId) return () => {};
  const q = query(statusCommentsCollection(authorUid, statusId), orderBy("createdAt", "desc"), limit(count));
  return onSnapshot(
    q,
    (snap) => onNext(mapDocs(snap)),
    onError
  );
}

/**
 * Add a comment to a status and bump its commentCount.
 * @param {string} authorUid
 * @param {string} statusId
 * @param {{ authorId, authorName, authorPhotoURL, text }} data
 */
export async function addStatusComment(authorUid, statusId, data) {
  if (!authorUid || !statusId || !data?.text) return "";
  const ref = await addDoc(statusCommentsCollection(authorUid, statusId), {
    authorId: data.authorId,
    authorName: data.authorName,
    authorPhotoURL: data.authorPhotoURL || "",
    text: data.text,
    createdAt: serverTimestamp(),
  });
  await updateDoc(statusDoc(authorUid, statusId), {
    commentCount: increment(1),
  });
  return ref.id;
}

/**
 * Delete a comment (its author or the status owner).
 * @param {string} authorUid
 * @param {string} statusId
 * @param {string} commentId
 */
export async function deleteStatusComment(authorUid, statusId, commentId) {
  if (!authorUid || !statusId || !commentId) return;
  await deleteDoc(doc(statusCommentsCollection(authorUid, statusId), commentId));
  await updateDoc(statusDoc(authorUid, statusId), {
    commentCount: increment(-1),
  });
}

function mapDocs(snap) {
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * Live subscription to the current user's own statuses (both public and
 * private). Expired docs drop off the result automatically.
 * @param {string} uid
 * @param {(statuses: Array<object>) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeOwnStatuses(uid, onNext, onError) {
  return onSnapshot(
    query(statusesCollection(uid), where("expiresAt", ">=", Timestamp.now())),
    (snap) => onNext(mapDocs(snap)),
    (err) => onError?.(err)
  );
}

/**
 * Live subscription to the statuses (public AND private) of every followed
 * account. One listener per followed user (each is a small collection on
 * `users/{uid}/statuses`), merged into a single list; expired docs drop off
 * automatically. This is how the home status rail knows what to show — a user
 * only ever sees the statuses of the accounts they follow, plus their own.
 *
 * The rules only expose a private account's statuses to the account itself
 * and to its approved followers, so a `permission-denied` for a single user
 * (e.g. a request withdrawn mid-list) is ignored rather than failing the rail.
 * Callers should re-subscribe when the following list changes.
 * @param {Array<string>} followingIds
 * @param {(statuses: Array<object>) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeFollowingStatuses(followingIds, onNext, onError) {
  const byAuthor = new Map();
  const emit = () => {
    onNext([...byAuthor.values()].flat().filter((s) => isStatusActive(s)));
  };
  const unsubs = followingIds.map((uid) =>
    onSnapshot(
      query(statusesCollection(uid), where("expiresAt", ">=", Timestamp.now())),
      (snap) => {
        byAuthor.set(uid, mapDocs(snap));
        emit();
      },
      (err) => {
        if (err?.code === "permission-denied") return;
        onError?.(err);
      }
    )
  );
  return () => {
    for (const unsub of unsubs) unsub();
  };
}
