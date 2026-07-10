import { useEffect, useRef } from "react";

type CursorState = "default" | "action" | "text" | "pressed" | "disabled" | "grab" | "grabbing" | "hidden";

const cursorStates: CursorState[] = ["default", "action", "text", "pressed", "disabled", "grab", "grabbing", "hidden"];
const textInputSelector = [
  "textarea",
  "[contenteditable='true']",
  "input:not([type])",
  "input[type='text']",
  "input[type='email']",
  "input[type='password']",
  "input[type='search']",
  "input[type='tel']",
  "input[type='url']",
  "input[type='number']",
  "input[type='date']",
  "input[type='time']",
  "input[type='datetime-local']",
  "input[type='month']",
  "input[type='week']",
].join(",");
const actionSelector = [
  "a",
  "button",
  "summary",
  "select",
  "input[type='button']",
  "input[type='submit']",
  "input[type='reset']",
  "input[type='checkbox']",
  "input[type='radio']",
  "input[type='range']",
  "[role='button']",
  "[role='link']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function classifyTarget(target: EventTarget | null): CursorState {
  if (!(target instanceof Element)) {
    return "default";
  }

  if (target.closest("iframe, video, [data-cursor='hidden']")) {
    return "hidden";
  }
  if (target.closest(":disabled, [aria-disabled='true'], .cursor-not-allowed, [data-cursor='disabled']")) {
    return "disabled";
  }
  const explicit = target.closest<HTMLElement>("[data-cursor]")?.dataset.cursor;
  if (explicit && cursorStates.includes(explicit as CursorState)) {
    return explicit as CursorState;
  }
  if (target.closest(textInputSelector)) {
    return "text";
  }
  if (target.closest(".passport-card-hitbox, [data-cursor='grab']")) {
    return "grab";
  }
  if (target.closest(actionSelector)) {
    return "action";
  }
  return "default";
}

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    const point = pointRef.current;
    const frame = frameRef.current;
    if (!cursor || !point || !frame) {
      return;
    }

    const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const forcedColorsQuery = window.matchMedia("(forced-colors: active)");
    let enabled = false;
    let active = false;
    let visible = false;
    let pressed = false;
    let baseState: CursorState = "default";
    let animationFrameId: number | null = null;
    let targetX = 0;
    let targetY = 0;
    let frameX = 0;
    let frameY = 0;
    let frameInitialized = false;

    const eligible = () => finePointerQuery.matches && !reducedMotionQuery.matches && !forcedColorsQuery.matches;
    const isNonMousePointer = (event: PointerEvent) => event.pointerType === "touch" || event.pointerType === "pen";

    const setVisible = (nextVisible: boolean) => {
      visible = nextVisible;
      cursor.classList.toggle("is-visible", nextVisible);
    };

    const setState = () => {
      const nextState: CursorState = baseState === "hidden"
        ? "hidden"
        : pressed
          ? baseState === "grab" ? "grabbing" : "pressed"
          : baseState;
      cursor.dataset.cursorState = nextState;
    };

    const stopFrame = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    const restoreNativeCursor = () => {
      active = false;
      pressed = false;
      frameInitialized = false;
      setVisible(false);
      stopFrame();
      document.documentElement.classList.remove("cova-custom-cursor-active");
      cursor.removeAttribute("data-cursor-active");
      baseState = "default";
      setState();
    };

    const refreshEligibility = () => {
      enabled = eligible();
      if (!enabled) {
        restoreNativeCursor();
      }
    };

    const activate = () => {
      if (!enabled || active) {
        return;
      }
      active = true;
      cursor.dataset.cursorActive = "true";
      document.documentElement.classList.add("cova-custom-cursor-active");
    };

    const position = (element: HTMLElement, x: number, y: number) => {
      element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, -50%)`;
    };

    const animateFrame = () => {
      animationFrameId = null;
      if (!enabled || !active || !visible) {
        return;
      }

      const deltaX = targetX - frameX;
      const deltaY = targetY - frameY;
      frameX += deltaX * 0.42;
      frameY += deltaY * 0.42;
      position(frame, frameX, frameY);

      if (Math.abs(deltaX) > 0.12 || Math.abs(deltaY) > 0.12) {
        animationFrameId = window.requestAnimationFrame(animateFrame);
      } else {
        frameX = targetX;
        frameY = targetY;
        position(frame, frameX, frameY);
      }
    };

    const scheduleFrame = () => {
      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(animateFrame);
      }
    };

    const movePointer = (event: PointerEvent) => {
      if (isNonMousePointer(event)) {
        enabled = false;
        restoreNativeCursor();
        return;
      }
      if (!eligible()) {
        enabled = false;
        restoreNativeCursor();
        return;
      }
      enabled = true;
      const nextState = classifyTarget(event.target);
      if (nextState === "hidden") {
        restoreNativeCursor();
        return;
      }
      baseState = nextState;
      setState();
      activate();
      targetX = event.clientX;
      targetY = event.clientY;
      position(point, targetX, targetY);
      if (!frameInitialized) {
        frameX = targetX;
        frameY = targetY;
        frameInitialized = true;
        position(frame, frameX, frameY);
      }
      setVisible(true);
      if (baseState === "text") {
        stopFrame();
        frameX = targetX;
        frameY = targetY;
        position(frame, frameX, frameY);
      } else {
        scheduleFrame();
      }
    };

    const updateTargetState = (event: PointerEvent) => {
      if (isNonMousePointer(event)) {
        enabled = false;
        restoreNativeCursor();
        return;
      }
      if (!enabled) {
        return;
      }
      baseState = classifyTarget(event.target);
      if (baseState === "hidden") {
        restoreNativeCursor();
        return;
      }
      setState();
      setVisible(true);
    };

    const leaveTarget = (event: PointerEvent) => {
      if (isNonMousePointer(event)) {
        enabled = false;
        restoreNativeCursor();
        return;
      }
      if (event.relatedTarget instanceof Element) {
        baseState = classifyTarget(event.relatedTarget);
        if (baseState === "hidden") {
          restoreNativeCursor();
          return;
        }
        setState();
        setVisible(true);
      } else {
        restoreNativeCursor();
      }
    };

    const pressPointer = (event: PointerEvent) => {
      if (isNonMousePointer(event)) {
        enabled = false;
        restoreNativeCursor();
        return;
      }
      if (!enabled) {
        return;
      }
      baseState = classifyTarget(event.target);
      if (baseState === "hidden") {
        restoreNativeCursor();
        return;
      }
      if (baseState === "disabled") {
        pressed = false;
        setState();
        return;
      }
      pressed = true;
      setState();
    };

    const releasePointer = (event: PointerEvent) => {
      if (isNonMousePointer(event)) {
        enabled = false;
        restoreNativeCursor();
        return;
      }
      pressed = false;
      baseState = classifyTarget(event.target);
      if (baseState === "hidden") {
        restoreNativeCursor();
        return;
      }
      setState();
    };

    const leaveViewport = () => restoreNativeCursor();
    const handleVisibility = () => restoreNativeCursor();

    refreshEligibility();
    finePointerQuery.addEventListener("change", refreshEligibility);
    reducedMotionQuery.addEventListener("change", refreshEligibility);
    forcedColorsQuery.addEventListener("change", refreshEligibility);
    window.addEventListener("pointermove", movePointer, { passive: true });
    window.addEventListener("pointerover", updateTargetState, { passive: true });
    window.addEventListener("pointerout", leaveTarget, { passive: true });
    window.addEventListener("pointerdown", pressPointer, { passive: true });
    window.addEventListener("pointerup", releasePointer, { passive: true });
    window.addEventListener("pointercancel", releasePointer, { passive: true });
    window.addEventListener("blur", leaveViewport);
    document.documentElement.addEventListener("pointerleave", leaveViewport);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      restoreNativeCursor();
      finePointerQuery.removeEventListener("change", refreshEligibility);
      reducedMotionQuery.removeEventListener("change", refreshEligibility);
      forcedColorsQuery.removeEventListener("change", refreshEligibility);
      window.removeEventListener("pointermove", movePointer);
      window.removeEventListener("pointerover", updateTargetState);
      window.removeEventListener("pointerout", leaveTarget);
      window.removeEventListener("pointerdown", pressPointer);
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
      window.removeEventListener("blur", leaveViewport);
      document.documentElement.removeEventListener("pointerleave", leaveViewport);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <div ref={cursorRef} className="cova-cursor" data-cursor-state="default" aria-hidden="true">
      <span ref={pointRef} className="cova-cursor-point" />
      <span ref={frameRef} className="cova-cursor-frame">
        <span className="cova-cursor-frame-geometry">
          <i className="cova-cursor-notch is-top" />
          <i className="cova-cursor-notch is-right" />
          <i className="cova-cursor-notch is-bottom" />
          <i className="cova-cursor-notch is-left" />
        </span>
      </span>
    </div>
  );
}
