// A small map with one draggable pin, for confirming where a report is.
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ringPath } from "@shared/lib/spray.js";

const pin = L.divIcon({
  className: "rg-pin",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  html: `<svg width="36" height="36" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="var(--color-paper)" stroke="var(--color-ink)" stroke-width="2"/><path d="${ringPath([6, 6, 22, 22], 4)}" fill="none" stroke="var(--color-paint-deep)" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="14" r="2.6" fill="var(--color-ink)"/></svg>`,
});

function Recenter({ center }) {
  const map = useMap();
  const last = useRef(null);
  useEffect(() => {
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
    if (last.current !== key) {
      last.current = key;
      map.setView([center.lat, center.lng], Math.max(map.getZoom(), 16), { animate: false });
    }
  }, [center, map]);
  return null;
}

function TapToMove({ onMove }) {
  useMapEvents({ click: (e) => onMove(e.latlng) });
  return null;
}

export default function PinMap({ center, onMove }) {
  const handlers = useMemo(() => ({ dragend: (e) => onMove(e.target.getLatLng()) }), [onMove]);
  return (
    <div className="relative mt-2 h-56 overflow-hidden rounded-md border border-line" role="region" aria-label="Map: drag the pin or tap to set the report location">
      <MapContainer center={[center.lat, center.lng]} zoom={16} className="rg-map h-full w-full" scrollWheelZoom={false}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={19} />
        <Recenter center={center} />
        <TapToMove onMove={onMove} />
        <Marker position={[center.lat, center.lng]} icon={pin} draggable eventHandlers={handlers} keyboard title="Report location" />
      </MapContainer>
    </div>
  );
}
