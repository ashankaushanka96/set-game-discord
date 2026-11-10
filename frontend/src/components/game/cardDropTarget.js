// Prefer the nearest player, including teammates, so a forgiving drop area
// never redirects a drop meant for an invalid player onto an opponent.
export function nearestPlayerAt(x, y, seats, margin = 36) {
  let nearest = null;
  for (const seat of seats) {
    const { left, right, top, bottom } = seat.rect;
    const dx = Math.max(left - x, 0, x - right);
    const dy = Math.max(top - y, 0, y - bottom);
    const distance = Math.hypot(dx, dy);
    if (distance > margin) continue;
    const centerDistance = Math.hypot(x - (left + right) / 2, y - (top + bottom) / 2);
    if (!nearest || distance < nearest.distance || (distance === nearest.distance && centerDistance < nearest.centerDistance)) {
      nearest = { id: seat.id, distance, centerDistance };
    }
  }
  return nearest?.id || null;
}
