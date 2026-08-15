import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  getDocs,
  getDoc,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  increment,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

const POSTS_LIMIT = 6;
const FEED_FALLBACK_WINDOW = 100;
const SEARCH_FALLBACK_WINDOW = 100;

export function postsCollection() {
  return collection(db, "posts");
}

export function postDoc(postId) {
  return doc(db, "posts", postId);
}

// Set when Firestore reports a missing composite index. The feed and search
// then fall back to single-field queries (which only need automatic indexes)
// so the app keeps working until the composite indexes are deployed.
let feedIndexFallback = false;
let searchIndexFallback = false;
let feedProbe = null;

/**
 * Probe whether the `isPrivate` + `createdAt` composite index exists by
 * issuing a tiny version of the feed query. Caches the result for the session.
 * @returns {Promise<boolean>} true when the composite index is missing
 */
export function detectFeedIndexSupport() {
  if (feedProbe) return feedProbe;
  feedProbe = (async () => {
    try {
      await getDocs(
        query(
          postsCollection(),
          where("isPrivate", "==", false),
          orderBy("createdAt", "desc"),
          limit(1)
        )
      );
      feedIndexFallback = false;
    } catch (err) {
      feedIndexFallback = err?.code === "failed-precondition";
    }
    return feedIndexFallback;
  })();
  return feedProbe;
}

/**
 * Fetch a paginated feed of posts, newest first.
 *
 * The global feed only surfaces public posts; private posts are excluded
 * (they are only reachable on the author's own profile or via an approved
 * follower's home feed). Prefers the `isPrivate` + `createdAt` composite
 * index; when that index has not been deployed yet, falls back to a
 * single-field window query sorted in memory so the feed keeps working.
 * @param {object|null} cursor - last post snapshot to start after (optional).
 * @returns {Promise<{posts: Array, nextCursor: object|null}>}
 */
export async function fetchFeedPosts(cursor = null) {
  try {
    if (feedIndexFallback) return fetchFeedPostsFallback();
    let q = query(
      postsCollection(),
      where("isPrivate", "==", false),
      orderBy("createdAt", "desc"),
      limit(POSTS_LIMIT)
    );
    if (cursor) {
      q = query(
        postsCollection(),
        where("isPrivate", "==", false),
        orderBy("createdAt", "desc"),
        startAfter(cursor),
        limit(POSTS_LIMIT)
      );
    }

    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    const lastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    const hasMore = snapshot.docs.length === POSTS_LIMIT;

    return { posts, nextCursor: hasMore ? lastVisible : null };
  } catch (err) {
    if (err?.code === "failed-precondition") {
      feedIndexFallback = true;
      return fetchFeedPostsFallback();
    }
    throw err;
  }
}

async function fetchFeedPostsFallback() {
  const snapshot = await getDocs(
    query(postsCollection(), where("isPrivate", "==", false), limit(FEED_FALLBACK_WINDOW))
  );
  const posts = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return { posts, nextCursor: null };
}

/**
 * Fetch a single post.
 * @param {string} postId
 */
export async function fetchPost(postId) {
  const snapshot = await getDoc(postDoc(postId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

const SHARE_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SHARE_CODE_LENGTH = 8;

/**
 * Generate a random share code (letters + numbers) for a post's public link.
 * @param {number} length
 * @returns {string}
 */
export function generateShareCode(length = SHARE_CODE_LENGTH) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Whether a share code is already taken by another post.
 * @param {string} shareCode
 */
export async function shareCodeExists(shareCode) {
  const snap = await getDocs(query(postsCollection(), where("shareCode", "==", shareCode), limit(1)));
  return !snap.empty;
}

/**
 * Create a share code that is unique across existing posts. Retries a few
 * times before lengthening the code, so collisions are effectively impossible.
 * @returns {Promise<string>}
 */
export async function createUniqueShareCode() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateShareCode();
    if (!(await shareCodeExists(code))) return code;
  }
  return generateShareCode(SHARE_CODE_LENGTH + 4);
}

/**
 * Look up a post by its public share code. Returns null when no visible post
 * carries that code (unknown code, or a private post the viewer may not see).
 * @param {string} shareCode
 */
export async function fetchPostByShareCode(shareCode) {
  if (!shareCode) return null;
  try {
    const snap = await getDocs(query(postsCollection(), where("shareCode", "==", shareCode), limit(1)));
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  } catch (err) {
    if (err?.code === "permission-denied") return null;
    throw err;
  }
}

/**
 * Ensure a post has a share code, generating and persisting one for legacy
 * posts that predate the feature. The post doc is only updated when missing.
 * @param {object} post
 * @returns {Promise<string>} the post's share code
 */
export async function ensurePostShareCode(post) {
  if (post?.shareCode) return post.shareCode;
  const code = await createUniqueShareCode();
  await updateDoc(postDoc(post.id), { shareCode: code });
  return code;
}

/**
 * Create the post document first (before the image is attached) so the postId is known.
 * @param {object} data
 * @param {string} data.authorId
 * @param {string} data.authorName
 * @param {string} data.authorPhotoURL
 * @param {string} data.caption
 * @param {number} [data.fileSize] - original image size in bytes
 * @param {boolean} [data.isPrivate] - author's account is private
 * @returns {Promise<string>} the new post id
 */
export async function createPostDraft(data) {
  const caption = data.caption || "";
  const isPrivate = Boolean(data.isPrivate);
  const postData = {
    authorId: data.authorId,
    authorName: data.authorName,
    authorPhotoURL: data.authorPhotoURL || "",
    imageUrl: "",
    mediaType: "photo",
    caption,
    captionLower: caption.toLowerCase(),
    fileSize: data.fileSize || 0,
    isPrivate,
    likes: [],
    commentCount: 0,
    shareCode: await createUniqueShareCode(),
  };

  const docRef = await addDoc(postsCollection(), {
    ...postData,
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "users", data.authorId), {
    postsCount: increment(1),
  });

  return docRef.id;
}

/**
 * Attach the image (a base64 data URL stored in Firestore) to a post.
 * @param {string} postId
 * @param {string} imageUrl
 */
export async function attachPostImage(postId, imageUrl) {
  await updateDoc(postDoc(postId), { imageUrl });
}

/**
 * Toggle whether a specific post may be downloaded. Only meaningful when the
 * author's account-level "per-post download control" is enabled.
 * @param {string} postId
 * @param {boolean} allow
 */
export async function setPostDownloads(postId, allow) {
  const value = Boolean(allow);
  await updateDoc(postDoc(postId), { allowDownloads: value });
}

/**
 * Edit a post's caption (owner only). `captionLower` is kept in sync so
 * caption-prefix search keeps working after the edit.
 * @param {string} postId
 * @param {string} caption
 */
export async function updatePostCaption(postId, caption) {
  const value = (caption || "").trim();
  await updateDoc(postDoc(postId), {
    caption: value,
    captionLower: value.toLowerCase(),
  });
}

/**
 * Remove a draft post that failed to receive its image.
 * @param {string} postId
 * @param {string} authorId
 */
export async function cleanupDraftPost(postId, authorId) {
  try {
    await deleteDoc(postDoc(postId));
  } catch (err) {
    console.warn("Could not remove draft post", postId, err);
  }
  try {
    await updateDoc(doc(db, "users", authorId), { postsCount: increment(-1) });
  } catch (err) {
    console.warn("Could not restore postsCount", err);
  }
}

/**
 * Delete a post the user owns. The image lives inside the post document
 * (base64 data URL), so deleting the document removes it too.
 * @param {string} postId
 * @param {string} authorId
 */
export async function deletePost(postId, authorId) {
  await deleteDoc(postDoc(postId));
  try {
    await updateDoc(doc(db, "users", authorId), {
      postsCount: increment(-1),
    });
  } catch (err) {
    console.warn("Could not decrement postsCount", err);
  }
}

/**
 * Fetch posts for a given user, newest first.
 *
 * Uses a plain `where(authorId)` query and sorts/filters in memory so no
 * composite Firestore index is required. Pass `includePrivate: true` when the
 * caller may see the author's private posts (the author themself, or an
 * approved follower); otherwise private posts are filtered out client-side.
 * @param {string} authorId
 * @param {number} maxResults
 * @param {boolean} [includePrivate]
 * @returns {Promise<Array>}
 */
export async function fetchUserPosts(authorId, maxResults = 12, includePrivate = false) {
  const q = query(
    postsCollection(),
    where("authorId", "==", authorId),
    limit(maxResults * 2)
  );
  const snapshot = await getDocs(q);
  const posts = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((p) => includePrivate || !p.isPrivate);
  posts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return posts.slice(0, maxResults);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

/**
 * Search public posts by caption prefix (case-insensitive). Prefers the
 * `isPrivate` + `captionLower` composite index; when that index has not been
 * deployed yet, falls back to a single-field window query with an in-memory
 * prefix filter. Newest-first, sorted in memory.
 * @param {string} term
 * @param {number} maxResults
 */
export async function searchPosts(term, maxResults = 12) {
  const trimmed = (term || "").trim().toLowerCase();
  if (!trimmed) return [];

  try {
    if (searchIndexFallback) return searchPostsFallback(trimmed, maxResults);
    const q = query(
      postsCollection(),
      where("isPrivate", "==", false),
      where("captionLower", ">=", trimmed),
      where("captionLower", "<=", trimmed + "\uf8ff"),
      limit(maxResults * 2)
    );

    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    posts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return posts.slice(0, maxResults);
  } catch (err) {
    if (err?.code === "failed-precondition") {
      searchIndexFallback = true;
      return searchPostsFallback(trimmed, maxResults);
    }
    throw err;
  }
}

async function searchPostsFallback(trimmed, maxResults) {
  const snapshot = await getDocs(
    query(postsCollection(), where("isPrivate", "==", false), limit(SEARCH_FALLBACK_WINDOW))
  );
  return snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((p) => (p.captionLower || "").startsWith(trimmed))
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, maxResults);
}

/**
 * Live subscription to the newest public posts in the feed. Fires immediately
 * and on every change (new post, like, comment count, delete). Prefers the
 * `isPrivate` + `createdAt` composite index; without it, reads a wider window
 * of public posts with a single-field query and sorts newest-first in memory.
 *
 * `removedIds` lists documents that left the query result since the previous
 * snapshot (deleted, went private, or pushed out of the live window by a newer
 * post). The caller should verify before dropping older paginated posts.
 * @param {number} max
 * @param {(posts: Array, lastDoc: object|null, removedIds: string[]) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeFeedPosts(max, onNext, onError) {
  const q = feedIndexFallback
    ? query(postsCollection(), where("isPrivate", "==", false), limit(FEED_FALLBACK_WINDOW))
    : query(
        postsCollection(),
        where("isPrivate", "==", false),
        orderBy("createdAt", "desc"),
        limit(max)
      );
  return onSnapshot(
    q,
    (snap) => {
      let docs = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      let lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      if (feedIndexFallback) {
        docs.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        // No cursor-based pagination without the index, so surface a larger
        // slice of the window in one shot.
        docs = docs.slice(0, Math.max(max, 30));
        lastDoc = null;
      }
      const removedIds = snap
        .docChanges()
        .filter((change) => change.type === "removed")
        .map((change) => change.doc.id);
      onNext(docs, lastDoc, removedIds);
    },
    onError
  );
}

/**
 * Live subscription to a user's posts, newest first. Uses a plain `where`
 * query so no composite Firestore index is required; filters/sorts in memory.
 * @param {string} authorId
 * @param {number} max
 * @param {boolean} [includePrivate] - true when the viewer may see private posts
 * @param {(posts: Array) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeUserPosts(authorId, max, includePrivate = false, onNext, onError) {
  if (!authorId) return () => {};
  const q = query(postsCollection(), where("authorId", "==", authorId), limit(max * 2));
  return onSnapshot(
    q,
    (snap) => {
      const posts = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((p) => includePrivate || !p.isPrivate);
      posts.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onNext(posts.slice(0, max));
    },
    onError
  );
}

/**
 * Live subscription to a single post. Calls onNext(false) when the post no
 * longer exists.
 * @param {string} postId
 * @param {(post: object | false) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribePost(postId, onNext, onError) {
  if (!postId) return () => {};
  return onSnapshot(
    postDoc(postId),
    (snap) => onNext(snap.exists() ? { id: snap.id, ...snap.data() } : false),
    onError
  );
}

/**
 * Fetch private posts authored by the given approved-following users,
 * newest first. Fetches a window from each author and filters/merges in
 * memory, so no composite Firestore index is required.
 *
 * Public posts from the same authors are intentionally omitted — the home
 * feed merges these with the global feed (public posts) client-side.
 * @param {string[]} followingIds
 * @param {number} perAuthor
 * @param {number} max
 */
export async function fetchFollowingPrivatePosts(followingIds, perAuthor = 12, max = 60) {
  const lists = await Promise.all(
    followingIds.map(async (uid) => {
      const q = query(
        postsCollection(),
        where("authorId", "==", uid),
        limit(perAuthor * 4)
      );
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.isPrivate === true)
        .slice(0, perAuthor);
    })
  );
  const merged = lists.flat().sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return merged.slice(0, max);
}
