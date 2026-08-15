import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, orderBy, limit, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export function savedPostDoc(uid, postId) {
  return doc(db, "users", uid, "savedPosts", postId);
}

export function savedPostsCollection(uid) {
  return collection(db, "users", uid, "savedPosts");
}

/**
 * Save a post for the current user.
 * @param {string} uid
 * @param {string} postId
 */
export async function savePost(uid, postId) {
  await setDoc(savedPostDoc(uid, postId), { savedAt: serverTimestamp() });
}

/**
 * Remove a saved post.
 */
export async function unsavePost(uid, postId) {
  await deleteDoc(savedPostDoc(uid, postId));
}

/**
 * Check whether a post is saved by the current user.
 */
export async function isSaved(uid, postId) {
  if (!uid || !postId) return false;
  const snapshot = await getDoc(savedPostDoc(uid, postId));
  return snapshot.exists();
}

/**
 * Fetch the full post docs for everything the user has saved, newest saved first.
 * @param {string} uid
 * @param {number} max
 */
export async function fetchSavedPosts(uid, max = 20) {
  if (!uid) return [];
  const q = query(savedPostsCollection(uid), orderBy("savedAt", "desc"), limit(max));
  const snapshot = await getDocs(q);
  const postIds = snapshot.docs.map((d) => d.id);

  const posts = await Promise.all(
    postIds.map(async (id) => {
      const postSnap = await getDoc(doc(db, "posts", id));
      return postSnap.exists() ? { id: postSnap.id, ...postSnap.data() } : null;
    })
  );

  return posts.filter(Boolean);
}

/**
 * Live subscription to whether the current user has saved a post.
 * @param {string} uid
 * @param {string} postId
 * @param {(isSaved: boolean) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeSaved(uid, postId, onNext, onError) {
  if (!uid || !postId) return () => {};
  return onSnapshot(savedPostDoc(uid, postId), (snap) => onNext(snap.exists()), onError);
}

/**
 * Live subscription to the ids of everything the user has saved, newest saved
 * first (the post docs themselves are fetched separately).
 * @param {string} uid
 * @param {number} max
 * @param {(postIds: string[]) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeSavedPosts(uid, max, onNext, onError) {
  if (!uid) return () => {};
  const q = query(savedPostsCollection(uid), orderBy("savedAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => onNext(snap.docs.map((d) => d.id)),
    onError
  );
}
