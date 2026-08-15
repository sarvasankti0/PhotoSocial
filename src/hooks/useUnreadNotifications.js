import { useEffect, useState } from "react";
import { subscribeUnreadCount } from "../services/notifications";

/**
 * Live unread notification count for the current user. Updates the moment a
 * new notification arrives or an existing one is marked read.
 * @param {string|null} uid
 */
export default function useUnreadNotifications(uid) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }
    return subscribeUnreadCount(
      uid,
      (value) => setCount(value),
      () => {}
    );
  }, [uid]);

  return count;
}
