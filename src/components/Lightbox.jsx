import { useEffect, useState } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Fullscreen zoom view for a photo. First tap fits the image on screen;
 * a second tap zooms it to natural size (scrollable).
 */
export default function Lightbox({ src, alt = "", onClose }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className={`lightbox ${zoomed ? "is-zoomed" : ""}`} onClick={onClose} role="dialog" aria-modal="true" aria-label="Zoomed image">
      <button className="lightbox-close" onClick={onClose} aria-label="Close zoomed image">
        <X size={26} />
      </button>
      <button
        className="lightbox-zoom-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
        aria-label={zoomed ? "Zoom out" : "Zoom in"}
      >
        {zoomed ? <ZoomOut size={22} /> : <ZoomIn size={22} />}
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => {
          e.stopPropagation();
          setZoomed((z) => !z);
        }}
        className="lightbox-image"
      />
      <span className="lightbox-hint">{zoomed ? "Tap image or press Esc to zoom out" : "Tap the image to zoom in"}</span>
    </div>
  );
}
