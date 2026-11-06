import { useEffect, useLayoutEffect, useState } from 'react';
import { Animated, PanResponder } from 'react-native';

import { cropTransform, fitCrop, moveCrop } from '../utils/photoCrop';

/** Where a set of touches are within the frame, whose top left on the page is `origin`. */
function fingers(touches, origin) {
  const [a, b] = touches;
  if (!b) return { x: a.pageX - origin.x, y: a.pageY - origin.y, distance: 0 };
  return {
    x: (a.pageX + b.pageX) / 2 - origin.x,
    y: (a.pageY + b.pageY) / 2 - origin.y,
    distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
  };
}

/** The Animated values and handlers, made once and kept across renders. */
function createCropper() {
  const transform = {
    translateX: new Animated.Value(0),
    translateY: new Animated.Value(0),
    scale: new Animated.Value(1),
  };
  let frame = {}; // this render's { aspect, width, height, onChange }
  let live = null; // the crop on screen
  let gesture = null; // { origin, count, start, from }

  const show = (crop) => {
    live = crop;
    const { translateX, translateY, scale } = cropTransform(
      crop,
      frame.aspect,
      frame.width,
      frame.height
    );
    transform.translateX.setValue(translateX);
    transform.translateY.setValue(translateY);
    transform.scale.setValue(scale);
  };
  // A finger going down or lifting starts again from here, so the photo doesn't jump.
  const begin = (touches, origin) => {
    gesture = { origin, count: touches.length, start: live, from: fingers(touches, origin) };
  };
  const touchesOf = ({ nativeEvent }) =>
    nativeEvent.touches?.length ? nativeEvent.touches : [nativeEvent];
  const finish = () => frame.onChange(live);

  const { panHandlers } = PanResponder.create({
    onStartShouldSetPanResponder: () => !!frame.aspect,
    onMoveShouldSetPanResponder: () => !!frame.aspect,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const { pageX, pageY, locationX, locationY } = e.nativeEvent;
      begin(touchesOf(e), { x: pageX - locationX, y: pageY - locationY });
    },
    onPanResponderMove: (e) => {
      const touches = touchesOf(e);
      if (touches.length !== gesture.count) {
        begin(touches, gesture.origin);
        return;
      }
      const to = fingers(touches, gesture.origin);
      show(moveCrop(gesture.start, gesture.from, to, frame.aspect, frame.width, frame.height));
    },
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
  });

  return {
    transform,
    panHandlers,
    setFrame: (next) => {
      frame = next;
    },
    show,
  };
}

/**
 * Drag and pinch a photo within a frame: `panHandlers` go on a view covering the
 * frame, and `transform` on the photo (see cropTransform). The photo moves without a
 * render, and onChange gets the new crop when the fingers lift. `aspect` null turns
 * it off.
 */
export function usePhotoCrop({ aspect, width, height, crop, onChange }) {
  const [cropper] = useState(createCropper);

  useEffect(() => {
    cropper.setFrame({ aspect, width, height, onChange });
  });

  useLayoutEffect(() => {
    if (!aspect) return;
    cropper.setFrame({ aspect, width, height, onChange });
    cropper.show(fitCrop(crop, aspect, width, height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, width, height, crop]);

  return cropper;
}
