'use strict';

function nextFailureState({ failedLoginCount, lockedUntil, now = Date.now(), limit = 10, lockMinutes = 15 }) {
  const previousLock = lockedUntil ? new Date(lockedUntil).getTime() : 0;
  const expired = previousLock > 0 && previousLock <= now;
  const nextCount = (expired ? 0 : Number(failedLoginCount || 0)) + 1;
  const locked = nextCount >= limit;
  return {
    failedLoginCount: Math.min(nextCount, limit),
    locked,
    lockedUntil: locked ? new Date(now + lockMinutes * 60 * 1000) : null,
  };
}

module.exports = { nextFailureState };
