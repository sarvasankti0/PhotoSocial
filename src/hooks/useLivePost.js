import { useEffect, useState } from "react";
import { subscribePost } from "../services/posts";

/**
 * Live subscription to a single post document.
 * - null: loading (no snapshot yet)
 * - false: the post no longer exists
 * - object: the live post data
 * @param {string|null} postId
 */
export default function useLivePost(postId) {
  const [post, setPost] = useState(null);

  useEffect(() => {
    if (!postId) {
      setPost(null);
      return;
    }
    return subscribePost(
      postId,
      (value) => setPost(value),
      () => {}
    );
  }, [postId]);

  return post;
}
