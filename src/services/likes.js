import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../firebase";

export function postDoc(postId) {
  return doc(db, "posts", postId);
}

/**
 * Toggle the like state for a post using atomic array operations.
 * @param {string} postId
 * @param {string} uid
 * @param {boolean} currentlyLiked
 */
export async function toggleLike(postId, uid, currentlyLiked) {
  const ref = postDoc(postId);
  if (currentlyLiked) {
    await updateDoc(ref, { likes: arrayRemove(uid) });
  } else {
    await updateDoc(ref, { likes: arrayUnion(uid) });
  }
}

export function isLikedBy(post, uid) {
  return Array.isArray(post?.likes) && post.likes.includes(uid);
}
