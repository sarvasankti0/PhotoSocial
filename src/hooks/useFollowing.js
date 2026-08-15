import { useEffect, useState } from "react";
import { subscribeFollowing } from "../services/follows";

/**
 * Live following state between two users. Updates the moment the relation
 * document changes (from any device).
 * @param {string|null} viewerUid
 * @param {string|null} targetUid
 */
export default function useFollowing(viewerUid, targetUid) {
  const [following, setFollowing] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!viewerUid || !targetUid || viewerUid === targetUid) {
      setFollowing(false);
      setChecked(false);
      return;
    }
    return subscribeFollowing(
      viewerUid,
      targetUid,
      (value) => {
        setFollowing(value);
        setChecked(true);
      },
      () => {}
    );
  }, [viewerUid, targetUid]);

  return { following, checked };
}
