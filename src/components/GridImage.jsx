import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * Square grid thumbnail. Shows an empty placeholder when the image is
 * missing or fails to load.
 * @param {{ src?: string, alt?: string }} props
 */
export default function GridImage({ src, alt }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="grid-item-empty">
        <ImageOff size={20} />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt || "Post"}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
