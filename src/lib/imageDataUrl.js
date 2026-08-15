// Images are stored inside Firestore documents as base64 data URLs, so they
// must stay small: a Firestore document is capped at ~1 MiB. This module
// downscales and re-encodes images with a plain <canvas> — no third-party
// library, web workers, or runtime CDN fetches — so the pipeline works on
// every modern browser out of the box.

const MAX_DIMENSIONS = { post: 1200, avatar: 400, status: 1080 };
const MAX_BYTES = { post: 500 * 1024, avatar: 300 * 1024, status: 500 * 1024 };
const QUALITY_START = 0.75;
const QUALITY_FLOOR = 0.3;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image type is not supported by your browser."));
    };
    img.src = url;
  });
}

function canvasToDataUrl(canvas, quality) {
  try {
    return canvas.toDataURL("image/webp", quality);
  } catch (err) {
    return canvas.toDataURL("image/jpeg", quality);
  }
}

// Base64 data URL byte size without allocating the decoded buffer.
function base64Size(dataUrl) {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return 0;
  return Math.floor((dataUrl.length - comma - 1) * 0.75);
}

function drawScaled(img, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare this image.");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function bestDataUrl(canvas, maxBytes) {
  let best = canvasToDataUrl(canvas, QUALITY_START);
  if (base64Size(best) <= maxBytes) return best;
  for (let q = QUALITY_START - 0.1; q >= QUALITY_FLOOR; q -= 0.1) {
    const candidate = canvasToDataUrl(canvas, q);
    if (base64Size(candidate) <= maxBytes) return candidate;
    best = candidate;
  }
  return best;
}

/**
 * Downscale / re-encode an image file into a base64 data URL small enough to
 * store inside a Firestore document.
 * @param {File|Blob} file
 * @param {"post"|"avatar"|"status"} kind
 * @returns {Promise<{ dataUrl: string, size: number }>} size is the compressed byte length
 */
export async function imageToDataUrl(file, kind = "post") {
  if (!(file instanceof Blob)) {
    throw new Error("Please select a valid image file.");
  }

  const maxDimension = MAX_DIMENSIONS[kind] || MAX_DIMENSIONS.post;
  const maxBytes = MAX_BYTES[kind] || MAX_BYTES.post;

  const img = await loadImage(file);
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new Error("Could not read this image.");
  }

  let canvas = drawScaled(img, maxDimension);
  let dataUrl = bestDataUrl(canvas, maxBytes);

  // Rare case: a very noisy image is still too big at the quality floor.
  // Shrink the canvas below maxDimension in steps until it fits.
  while (base64Size(dataUrl) > maxBytes && canvas.width > 64) {
    const next = document.createElement("canvas");
    next.width = Math.max(64, Math.round(canvas.width * 0.75));
    next.height = Math.max(64, Math.round(canvas.height * 0.75));
    next.getContext("2d").drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
    dataUrl = bestDataUrl(canvas, maxBytes);
  }

  if (base64Size(dataUrl) > maxBytes) {
    throw new Error("This image is too large to save. Please choose a smaller photo.");
  }

  return { dataUrl, size: base64Size(dataUrl) };
}
