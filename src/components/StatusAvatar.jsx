import { useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, CirclePlay } from "lucide-react";
import Avatar from "./Avatar";
import { useStatus } from "../context/StatusContext";

/**
 * Avatar that gains a story ring when the user has an active 24-hour status.
 * Clicking a ringed avatar opens a menu with two options:
 *   1. See profile picture (full-screen)
 *   2. See the user's status (story viewer)
 * When the user has no active status, renders exactly like the plain Avatar
 * so the surrounding click handlers (e.g. "open profile") keep working.
 */
export default function StatusAvatar({ uid, src, alt = "", name, size = 40, className = "" }) {
  const { statusOf, viewStatus, viewAvatar } = useStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasStatus = Boolean(uid && statusOf(uid));

  if (!hasStatus) {
    return <Avatar src={src} alt={alt} size={size} className={className} />;
  }

  const closeMenu = () => setMenuOpen(false);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(true);
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        className={`status-avatar-wrap ${className}`}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(true);
          }
        }}
        aria-label={`Options for ${alt}`}
      >
        <span className="status-ring is-active">
          <Avatar src={src} alt={alt} size={size} />
        </span>
      </span>

      {menuOpen &&
        createPortal(
          <div className="modal-overlay status-menu-overlay" onClick={closeMenu}>
            <div
              className="status-menu"
              onClick={(e) => e.stopPropagation()}
              role="menu"
              aria-label="User options"
            >
              <button
                className="status-menu-item"
                onClick={() => {
                  closeMenu();
                  viewAvatar(src, alt || name);
                }}
                role="menuitem"
              >
                <ImageIcon size={18} /> See profile picture
              </button>
              <button
                className="status-menu-item"
                onClick={() => {
                  closeMenu();
                  viewStatus(uid);
                }}
                role="menuitem"
              >
                <CirclePlay size={18} /> See user's status
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
