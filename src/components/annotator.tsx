"use client";

import { useEffect, useRef, useState } from "react";
import { boxAroundPoint, paddedEllipse, sourceRect } from "@/lib/domain/geometry";
import { isCurrentRegion } from "@/lib/domain/evidence";
import { lineNumber } from "@/lib/domain/invoice-math";
import type { Box2D, InvoiceLine, JobPhoto } from "@/lib/domain/types";

export function PhotoAnnotator({
  photo,
  lines,
  activeLineId,
  placingLineId,
  onSelectLine,
  onPlace,
  labelled = true,
}: {
  photo: JobPhoto;
  lines: InvoiceLine[];
  activeLineId?: string | null;
  placingLineId?: string | null;
  onSelectLine?: (lineId: string) => void;
  onPlace?: (box: Box2D) => void;
  labelled?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [frame, setFrame] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });

  function measure() {
    const image = imgRef.current;
    if (!image) return;
    const rect = image.getBoundingClientRect();
    const naturalWidth = image.naturalWidth || photo.width;
    const naturalHeight = image.naturalHeight || photo.height;
    const scale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    setFrame({
      offsetX: (rect.width - width) / 2,
      offsetY: (rect.height - height) / 2,
      width,
      height,
    });
  }

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.url, photo.width, photo.height]);

  const regions = lines.filter((line) => isCurrentRegion(line.photoRegion, photo));

  function placeFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    if (!placingLineId || !onPlace || !svgRef.current) return;
    const point = svgRef.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svgRef.current.getScreenCTM();
    if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    onPlace(boxAroundPoint((local.x / photo.width) * 1000, (local.y / photo.height) * 1000));
  }

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-[#EEF2F7]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={photo.url ?? ""} alt="Job photo without annotations burned in" className="max-h-[440px] w-full object-contain" onLoad={measure} />
      {photo.url && frame.width > 0 ? (
        <svg
          ref={svgRef}
          className="absolute"
          style={{ left: frame.offsetX, top: frame.offsetY, width: frame.width, height: frame.height }}
          viewBox={`0 0 ${photo.width} ${photo.height}`}
          onPointerDown={placeFromEvent}
          role="img"
          aria-label={regions.length ? regions.map((line) => `Marker ${lineNumber(lines, line.id)} circles ${line.photoRegion?.label}`).join(". ") : "Job photo"}
        >
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill="#1258F5" />
            </marker>
          </defs>
          {regions.map((line) => {
            const region = line.photoRegion!;
            const rect = sourceRect(region.box2d, photo.width, photo.height);
            const ellipse = paddedEllipse(rect, 0.1);
            const cx = rect.x + rect.width / 2;
            const cy = rect.y + rect.height / 2;
            const number = lineNumber(lines, line.id);
            const label = `${number} · ${region.label}`;
            const labelWidth = Math.min(photo.width * 0.46, 18 + label.length * (photo.width / 55));
            const labelHeight = photo.height * 0.07;
            let labelX = rect.x - labelWidth * 0.15;
            let labelY = Math.max(8, rect.y - labelHeight - photo.height * 0.03);
            labelX = Math.max(8, Math.min(labelX, photo.width - labelWidth - 8));
            labelY = Math.max(8, Math.min(labelY, photo.height - labelHeight - 8));
            const active = line.id === activeLineId;
            return (
              <g key={line.id} className="cursor-pointer" onPointerDown={(event) => { event.stopPropagation(); onSelectLine?.(line.id); }} tabIndex={0} role="button" aria-label={`Show invoice line ${number}, ${region.label}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectLine?.(line.id); }}>
                <ellipse cx={ellipse.x + ellipse.width / 2} cy={ellipse.y + ellipse.height / 2} rx={ellipse.width / 2} ry={ellipse.height / 2} fill="none" stroke={active ? "#0E4AD4" : "#1258F5"} strokeWidth={Math.max(photo.width, photo.height) / 180} />
                {labelled ? (
                  <>
                    <line x1={labelX + labelWidth * 0.72} y1={labelY + labelHeight} x2={cx} y2={cy} stroke="#1258F5" strokeWidth={Math.max(photo.width, photo.height) / 280} markerEnd="url(#arrowhead)" />
                    <rect x={labelX} y={labelY} width={labelWidth} height={labelHeight} rx={labelHeight / 2} fill="#1258F5" />
                    <text x={labelX + labelWidth / 2} y={labelY + labelHeight * 0.66} textAnchor="middle" fill="white" fontSize={labelHeight * 0.42} fontFamily="Plus Jakarta Sans, sans-serif" fontWeight={700}>
                      {label}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {placingLineId ? <p className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#1258F5]">Tap the part to place the marker</p> : null}
    </div>
  );
}
