import React, { useMemo } from "react";
import "./crt-edge-optics.css";

const mapSize = 128;
const bleed = 0.04;
const mapSpan = 1 + 2 * bleed;
const curveScale = 0.062;

function curveOffset(x, y) {
  return [-(x ** 3) * (1 - y ** 2) * 0.135, -y * Math.abs(y) * (1 - x ** 2) / 2];
}

export function sampleCurve(x, y, width, height) {
  const [offsetX, offsetY] = curveOffset(x * 2 / width - 1, y * 2 / height - 1);
  return [x + offsetX * curveScale * width, y + offsetY * curveScale * height];
}

function createCurveMap() {
  const canvas = document.createElement("canvas");
  canvas.width = mapSize;
  canvas.height = mapSize;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const map = context.createImageData(mapSize, mapSize);
  const coordinates = Array.from({ length: mapSize }, (_, i) => {
    const position = ((i + 0.5) / mapSize) * mapSpan - bleed;
    return Math.min(1, Math.max(-1, position * 2 - 1));
  });

  for (let row = 0; row < mapSize; row += 1) {
    const y = coordinates[row];
    for (let column = 0; column < mapSize; column += 1) {
      const x = coordinates[column];
      const index = (row * mapSize + column) * 4;
      // The filter samples inward along each edge, so the image bows outward.
      const [offsetX, offsetY] = curveOffset(x, y);
      map.data[index] = Math.round(255 * (0.5 + offsetX));
      map.data[index + 1] = Math.round(255 * (0.5 + offsetY));
      map.data[index + 2] = 128;
      map.data[index + 3] = 255;
    }
  }

  context.putImageData(map, 0, 0);
  return canvas.toDataURL("image/png");
}

function createLensMap(side) {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const map = context.createImageData(canvas.width, canvas.height);

  for (let row = 0; row < canvas.height; row += 1) {
    const y = 2 * (row + 0.5) / canvas.height - 1;
    for (let column = 0; column < canvas.width; column += 1) {
      const index = (row * canvas.width + column) * 4;
      map.data[index] = Math.round(255 * (0.5 - side * 0.4));
      map.data[index + 1] = Math.round(255 * (0.5 - y * 0.12));
      map.data[index + 3] = 255;
    }
  }

  context.putImageData(map, 0, 0);
  return canvas.toDataURL("image/png");
}

function LensFringeFilter({ id, map }) {
  return (
    <filter id={id} x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
      {map ? (
        <>
          <feImage href={map} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="radial-direction" />
          <feDisplacementMap in="SourceGraphic" in2="radial-direction" scale={0.007}
            xChannelSelector="R" yChannelSelector="G" result="red-outward" />
          <feDisplacementMap in="SourceGraphic" in2="radial-direction" scale={-0.0045}
            xChannelSelector="R" yChannelSelector="G" result="cyan-inward" />
          <feColorMatrix in="red-outward" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
          <feColorMatrix in="cyan-inward" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cyan" />
          <feBlend in="red" in2="cyan" mode="screen" />
        </>
      ) : <feOffset />}
    </filter>
  );
}

export default function CrtOptics() {
  const curveMap = useMemo(createCurveMap, []);
  const lensMaps = useMemo(() => [createLensMap(-1), createLensMap(1)], []);
  const region = { x: -bleed, y: -bleed, width: mapSpan, height: mapSpan };

  return (
    <svg className="terminal-filter" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="crt-glass-wide" clipPathUnits="objectBoundingBox">
          <path d="M.046 .014 Q.5 -.014 .954 .014 C.981 .016 .991 .034 .992 .067
            Q1.008 .5 .992 .933 C.991 .966 .981 .984 .954 .986
            Q.5 1.014 .046 .986 C.019 .984 .009 .966 .008 .933
            Q-.008 .5 .008 .067 C.009 .034 .019 .016 .046 .014 Z" />
        </clipPath>
        <clipPath id="crt-glass-narrow" clipPathUnits="objectBoundingBox">
          <path d="M.068 .007 Q.5 -.007 .932 .007 C.972 .008 .986 .018 .987 .039
            Q1.013 .5 .987 .961 C.986 .982 .972 .992 .932 .993
            Q.5 1.007 .068 .993 C.028 .992 .014 .982 .013 .961
            Q-.013 .5 .013 .039 C.014 .018 .028 .008 .068 .007 Z" />
        </clipPath>
        <filter id="crt-curve" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB" {...region}>
          {curveMap ? (
            <>
              <feImage href={curveMap} preserveAspectRatio="none" result="curve-map" {...region} />
              <feDisplacementMap in="SourceGraphic" in2="curve-map" scale={curveScale}
                xChannelSelector="R" yChannelSelector="G" {...region} />
            </>
          ) : <feOffset />}
        </filter>
        <LensFringeFilter id="crt-lens-west" map={lensMaps[0]} />
        <LensFringeFilter id="crt-lens-east" map={lensMaps[1]} />
      </defs>
    </svg>
  );
}
