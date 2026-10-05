// OpenStreetMap in monochrome with hazards drawn as small paint rings. Leaflet is loaded only with this chunk.
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ringPath } from "../lib/spray.js";

const MUMBAI = [19.07, 72.93];

function pinHtml({ level, status, selected, count }) {
  const fixed = status === "fixed";
  const color = fixed ? "var(--color-ok)" : level === "S4" ? "var(--color-crit)" : "var(--color-paint-deep)";
  const size = selected ? 34 : 26;
  const ring = ringPath([5, 5, 23, 23], (count || 1) + (level === "S4" ? 7 : 3));
  const badge = count > 1 ? `<span style="position:absolute;right:-4px;top:-5px;min-width:15px;height:15px;padding:0 3px;border-radius:2px;background:var(--color-ink);color:var(--color-paper);font:600 10px/15px var(--font-mono);text-align:center">${count}</span>` : "";
  return `<span style="position:relative;display:block;width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 28 28" style="overflow:visible">
      ${selected ? `<circle cx="14" cy="14" r="13" fill="var(--color-paper)" stroke="var(--color-ink)" stroke-width="2"/>` : `<circle cx="14" cy="14" r="10" fill="var(--color-paper)" opacity="0.85"/>`}
      <path d="${ring}" fill="none" stroke="${color}" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="14" cy="14" r="${fixed ? 0 : 2.6}" fill="${color}"/>
      ${fixed ? `<path d="M9 14.5l3.4 3.3L19 10.5" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    </svg>${badge}</span>`;
}

const STATUS_WORD = { submitted: "open", acknowledged: "acknowledged", in_progress: "crew assigned", fixed: "fixed" };

function markerName(p) {
  return [p.label || "Reported hazard", p.level, STATUS_WORD[p.status] || p.status, p.count > 1 ? `${p.count} reports` : null]
    .filter(Boolean).join(", ");
}

function NameContainer({ label }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().setAttribute("aria-label", `${label}. Use the arrow keys to pan and plus or minus to zoom.`);
  }, [map, label]);
  return null;
}

function Fit({ points, selected }) {
  const map = useMap();
  const key = points.map((p) => p.id).join(",");
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds.pad(0.15), { maxZoom: 14, animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  useEffect(() => {
    const p = points.find((x) => x.id === selected);
    if (p) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, map]);
  return null;
}

/**
 * @param {{points: Array<{id:string, lat:number, lng:number, level:string, status:string, label?:string, count?:number}>,
 *          selected?: string, onSelect?: (id:string)=>void, className?: string, interactive?: boolean}} props
 */
export default function RoadMap({ points, selected, onSelect, className = "", interactive = true, zoomControl = true, label = "Map of hazards" }) {
  const icons = useMemo(() => {
    const cache = {};
    for (const p of points) {
      const isSel = p.id === selected;
      const key = `${p.level}-${p.status}-${isSel}-${p.count || 1}`;
      if (!cache[key]) {
        const size = isSel ? 34 : 26;
        cache[key] = L.divIcon({ html: pinHtml({ ...p, selected: isSel }), className: "rg-pin", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
      }
    }
    return cache;
  }, [points, selected]);

  return (
    <div className={`relative isolate overflow-hidden rounded-md border border-line ${className}`} role="region" aria-label={label}>
      <MapContainer
        center={MUMBAI}
        zoom={11}
        className="rg-map h-full w-full"
        zoomControl={interactive && zoomControl}
        scrollWheelZoom={false}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        attributionControl
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <Fit points={points} selected={selected} />
        <NameContainer label={label} />
        {points.map((p) => (
          <Marker
            key={`${p.id}|${markerName(p)}`} // remount when the name changes: the label is only written when a pin is added
            position={[p.lat, p.lng]}
            icon={icons[`${p.level}-${p.status}-${p.id === selected}-${p.count || 1}`]}
            eventHandlers={{
              // A pin people can act on gets a name; on an overview map the pins are decoration of the link around it.
              add: (e) => interactive
                ? e.target.getElement()?.setAttribute("aria-label", markerName(p))
                : e.target.getElement()?.setAttribute("aria-hidden", "true"),
              ...(onSelect ? { click: () => onSelect(p.id) } : {}),
            }}
            interactive={interactive}
            keyboard={interactive && Boolean(onSelect)}
            title={p.label}
            alt={p.label}
          >
            {p.label && <Tooltip direction="top" offset={[0, -12]}>{p.label}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
