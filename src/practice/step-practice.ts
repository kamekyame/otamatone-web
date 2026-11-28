export const stepHoldMs = 180;

export function makeStepGate() {
  let since: number | undefined;
  let last: number | undefined;
  let needsRelease = false;
  let holding = false;
  let progress = 0;
  function interrupt() {
    since = last = undefined;
    holding = false;
    progress = 0;
  }
  return {
    interrupt,
    get holding() {
      return holding;
    },
    get progress() {
      return progress;
    },
    reset(waitForRelease = false) {
      interrupt();
      needsRelease = waitForRelease;
    },
    sample(now: number, matches: boolean) {
      if (last === undefined || now - last > 100) since = undefined;
      last = now;
      if (matches === needsRelease) {
        since = undefined;
        holding = false;
        progress = 0;
        return false;
      }
      since ??= now;
      holding = !needsRelease;
      progress = holding ? Math.min(1, (now - since) / stepHoldMs) : 0;
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
