import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

export function commentsCollection(postId) {
  return collection(db, "posts", postId, "comments");
}

export function commentDoc(postId, commentId) {
  return doc(db, "posts", postId, "comments", commentId);
}

/**
 * Fetch the most recent comments and replies for a post.
 * @param {string} postId
 * @param {number} count
 */
export async function fetchComments(postId, count = 100) {
  const q = query(commentsCollection(postId), orderBy("createdAt", "desc"), limit(count));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * Live subscription to a post's comments, newest first. Fires immediately and
 * on every change (new comment, love, pin, reply).
 * @param {string} postId
 * @param {number} count
 * @param {(comments: Array) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeComments(postId, count, onNext, onError) {
  if (!postId) return () => {};
  const q = query(commentsCollection(postId), orderBy("createdAt", "desc"), limit(count));
  return onSnapshot(
    q,
    (snap) => onNext(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))),
    onError
  );
}

/**
 * Add a comment (or a reply when replyToId is provided) and bump the post commentCount.
 * @param {string} postId
 * @param {{ authorId, authorName, authorPhotoURL, text, replyToId?, replyToName? }} data
 */
export async function addComment(postId, data) {
  const docRef = await addDoc(commentsCollection(postId), {
    authorId: data.authorId,
    authorName: data.authorName,
    authorPhotoURL: data.authorPhotoURL || "",
    text: data.text,
    replyToId: data.replyToId || "",
    replyToName: data.replyToName || "",
    loves: [],
    isPinned: false,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "posts", postId), {
    commentCount: increment(1),
  });

  return docRef.id;
}

/**
 * Toggle a love on a comment using atomic array operations.
 * @param {string} postId
 * @param {string} commentId
 * @param {string} uid
 * @param {boolean} currentlyLoved
 */
export async function toggleCommentLove(postId, commentId, uid, currentlyLoved) {
  const ref = commentDoc(postId, commentId);
  if (currentlyLoved) {
    await updateDoc(ref, { loves: arrayRemove(uid) });
  } else {
    await updateDoc(ref, { loves: arrayUnion(uid) });
  }
}

/**
 * Pin or unpin a comment (post owner only).
 * @param {string} postId
 * @param {string} commentId
 * @param {boolean} isPinned
 */
export async function setCommentPinned(postId, commentId, isPinned) {
  await updateDoc(commentDoc(postId, commentId), { isPinned: Boolean(isPinned) });
}
