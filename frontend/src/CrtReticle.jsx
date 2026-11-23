import React, { useEffect, useRef } from "react";
import { sampleCurve } from "./CrtOptics";
import "./crt-reticle.css";

function createScreenMap(screen) {
  const { width, height, transform, transformOrigin } = getComputedStyle(screen);
  const screenWidth = parseFloat(width);
  const screenHeight = parseFloat(height);
  const [originX, originY] = transformOrigin.split(" ").map(parseFloat);
  const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
  const { left, top } = screen.getBoundingClientRect();

  // Recover the projected origin from the four corners of the tilted screen.
  const corners = [[0, 0], [screenWidth, 0], [0, screenHeight], [screenWidth, screenHeight]]
    .map(([x, y]) => matrix.transformPoint({ x: x - originX, y: y - originY }));
  const projectedOriginX = left - Math.min(...corners.map((point) => point.x / point.w));
  const projectedOriginY = top - Math.min(...corners.map((point) => point.y / point.w));

  return (clientX, clientY) => {
    const x = clientX - projectedOriginX;
    const y = clientY - projectedOriginY;
    // Invert the perspective projection on the display plane.
    const a = matrix.m11 - x * matrix.m14;
    const b = matrix.m21 - x * matrix.m24;
    const c = matrix.m12 - y * matrix.m14;
    const d = matrix.m22 - y * matrix.m24;
    const u = x * matrix.m44 - matrix.m41;
    const v = y * matrix.m44 - matrix.m42;
    const determinant = a * d - b * c;
    return sampleCurve(
      (u * d - b * v) / determinant + originX,
      (a * v - u * c) / determinant + originY,
      screenWidth,
      screenHeight
    );
  };
}

export default function CrtReticle() {
  const reticleRef = useRef(null);

  useEffect(() => {
    const reticle = reticleRef.current;
    const glass = reticle.closest(".terminal-glass");
    const screen = glass.closest(".terminal-screen");
    let mapPointer;

    function reveal(event) {
      if (event.pointerType !== "mouse") return;
      mapPointer ??= createScreenMap(screen);
      const [x, y] = mapPointer(event.clientX, event.clientY);
      reticle.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      if (!glass.dataset.crtReticle) glass.dataset.crtReticle = "active";
    }

    function hide() {
      delete glass.dataset.crtReticle;
      mapPointer = undefined;
    }

    glass.addEventListener("pointerenter", reveal);
    glass.addEventListener("pointermove", reveal, { passive: true });
    glass.addEventListener("pointerleave", hide);
    glass.addEventListener("pointercancel", hide);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      glass.removeEventListener("pointerenter", reveal);
      glass.removeEventListener("pointermove", reveal);
      glass.removeEventListener("pointerleave", hide);
      glass.removeEventListener("pointercancel", hide);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  return (
    <svg ref={reticleRef} className="terminal-reticle" viewBox="0 0 24 24"
      aria-hidden="true" focusable="false">
      <path d="M12 3v5m0 8v5M3 12h5m8 0h5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="2" height="2" fill="currentColor" />
    </svg>
  );
}
