import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useStatus } from "../context/StatusContext";
import Avatar from "./Avatar";
import CreateStatusModal from "./CreateStatusModal";

/**
 * Story-style status rail pinned at the top of the Home feed. Always shows the
 * viewer's own circle first (with a + badge / 24h ring), followed by the
 * circles of every followed account with active statuses (one circle per user;
 * a user's multiple statuses all play inside the viewer). Tapping a circle
 * opens that user's status viewer.
 */
export default function StatusRail() {
  const { profile } = useAuth();
  const { statuses, statusOf, viewStatus } = useStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const ownUid = profile?.uid;
  const ownGroup = ownUid ? statusOf(ownUid) : null;
  const ownCount = ownGroup?.statuses?.length || 0;

  const openOwn = () => {
    if (ownCount > 0) setMenuOpen(true);
    else setCreating(true);
  };

  const others = statuses.filter((s) => s.uid !== ownUid);

  return (
    <section className="status-rail" aria-label="Statuses">
      <button className="status-circle" onClick={openOwn} aria-label="Your status">
        <span className={`status-ring ${ownCount > 0 ? "is-active" : "is-empty"}`}>
          <Avatar src={profile?.photoURL} alt="You" size={64} />
          <span className="status-plus">
            <Plus size={16} />
          </span>
          {ownCount > 1 && <span className="status-count">{ownCount}</span>}
        </span>
        <span className="status-label">Your status</span>
      </button>

      {others.map((s) => (
        <button
          key={s.uid}
          className="status-circle"
          onClick={() => viewStatus(s.uid)}
          aria-label={`View ${s.authorName || "user"}'s status`}
        >
          <span className="status-ring is-active">
            <Avatar src={s.authorPhotoURL} alt={s.authorName} size={64} />
            {s.statuses.length > 1 && <span className="status-count">{s.statuses.length}</span>}
          </span>
          <span className="status-label">{s.authorName || "User"}</span>
        </button>
      ))}

      {ownUid && menuOpen && (
        <div className="modal-overlay status-menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="status-menu" onClick={(e) => e.stopPropagation()} role="menu" aria-label="Your status options">
            <button
              className="status-menu-item"
              onClick={() => {
                setMenuOpen(false);
                viewStatus(ownUid);
              }}
              role="menuitem"
            >
              View your status
            </button>
            <button
              className="status-menu-item"
              onClick={() => {
                setMenuOpen(false);
                setCreating(true);
              }}
              role="menuitem"
            >
              Add new status
            </button>
          </div>
        </div>
      )}

      {creating && <CreateStatusModal onClose={() => setCreating(false)} />}
    </section>
  );
}
