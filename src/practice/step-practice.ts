export const stepHoldMs = 180;

export function makeStepGate() {
  let since: number | undefined;
  let last: number | undefined;
  let needsRelease = false;
  function interrupt() {
    since = last = undefined;
  }
  return {
    interrupt,
    reset(waitForRelease = false) {
      interrupt();
      needsRelease = waitForRelease;
    },
    sample(now: number, matches: boolean) {
      if (last === undefined || now - last > 100) since = undefined;
      last = now;
      if (matches === needsRelease) {
        since = undefined;
        return false;
      }
      since ??= now;
      if (now - since < (needsRelease ? 80 : stepHoldMs)) return false;
      since = undefined;
      if (needsRelease) {
        needsRelease = false;
        return false;
      }
      return true;
    },
  };
}
