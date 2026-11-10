// Decide once, then keep that gesture locked until the finger is lifted.
export function cardGestureMode(dx, dy, pointerType, isSelected) {
  if (Math.hypot(dx, dy) < 9) return 'pending';
  return pointerType === 'touch' && !isSelected && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'scroll' : 'drag';
}
