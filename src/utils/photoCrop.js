// How a photo sits in a frame it always fills. A crop is { zoom, x, y }: 1 is the
// photo just covering the frame, and x and y are the point of the photo at the
// frame's centre, as 0-1 across it. So one crop looks the same at any size of frame.

export const MAX_ZOOM = 3; // a 1080 pixel image goes soft much past this
export const CENTRED = { zoom: 1, x: 0.5, y: 0.5 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The photo's size when it just covers the frame. `aspect` is its width / height. */
export function coverSize(aspect, frameWidth, frameHeight) {
  return aspect > frameWidth / frameHeight
    ? { width: frameHeight * aspect, height: frameHeight }
    : { width: frameWidth, height: frameWidth / aspect };
}

/** The nearest crop that leaves no gap at the frame's edges. */
export function fitCrop(crop, aspect, frameWidth, frameHeight) {
  const cover = coverSize(aspect, frameWidth, frameHeight);
  const zoom = clamp(crop.zoom, 1, MAX_ZOOM);
  const halfX = frameWidth / (2 * cover.width * zoom);
  const halfY = frameHeight / (2 * cover.height * zoom);
  return { zoom, x: clamp(crop.x, halfX, 1 - halfX), y: clamp(crop.y, halfY, 1 - halfY) };
}

/**
 * The transform for a photo laid out at MAX_ZOOM with its origin at its top left.
 * It's always laid out at that size so that zooming never has to load it again.
 */
export function cropTransform(crop, aspect, frameWidth, frameHeight) {
  const cover = coverSize(aspect, frameWidth, frameHeight);
  return {
    translateX: frameWidth / 2 - crop.x * cover.width * crop.zoom,
    translateY: frameHeight / 2 - crop.y * cover.height * crop.zoom,
    scale: crop.zoom / MAX_ZOOM,
  };
}

/**
 * The crop after fingers move, keeping the photo's point under them there.
 * `from` and `to` are { x, y, distance }: their centre within the frame, and how far
 * apart they are (0 for one finger).
 */
export function moveCrop(start, from, to, aspect, frameWidth, frameHeight) {
  const cover = coverSize(aspect, frameWidth, frameHeight);
  const ratio = from.distance > 0 && to.distance > 0 ? to.distance / from.distance : 1;
  const zoom = clamp(start.zoom * ratio, 1, MAX_ZOOM);
  const along = (at, half, size, z) => (at - half) / (size * z);
  return fitCrop(
    {
      zoom,
      x:
        start.x +
        along(from.x, frameWidth / 2, cover.width, start.zoom) -
        along(to.x, frameWidth / 2, cover.width, zoom),
      y:
        start.y +
        along(from.y, frameHeight / 2, cover.height, start.zoom) -
        along(to.y, frameHeight / 2, cover.height, zoom),
    },
    aspect,
    frameWidth,
    frameHeight
  );
}
