import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api.js';

// Leaflet's default marker icons are resolved relative to the CSS file, which
// breaks under a bundler. Drawing the pin ourselves avoids the broken-image
// problem entirely and keeps it on-brand.
const pinIcon = L.divIcon({
  className: 'map-pin',
  html: '<span class="map-pin-dot"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Whole of Oyo State, used when we have nothing better to centre on.
const OYO_CENTRE = [8.15, 3.65];
const OYO_ZOOM = 8;
const WARD_ZOOM = 13;

// Ray-casting point-in-polygon over a GeoJSON Polygon/MultiPolygon.
function inGeometry(g, lat, lng) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return polys.some(([outer, ...holes]) => inRing(outer) && !holes.some(inRing));
}

/**
 * Tap-to-drop map for choosing where something goes.
 *
 * When GRID3 ward boundaries are loaded (Admin -> GRID3 ward boundaries) the
 * chosen ward is outlined and the map fits to it. Without them it falls back
 * to the average position of people already registered in the ward, and
 * failing that opens on the whole state for the user to pan.
 */
export default function WardMap({ lga, ward, sites, onChange, readOnly = false, height = 320 }) {
  const holder = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const outline = useRef(null);
  const [boundary, setBoundary] = useState(null);
  const [centreNote, setCentreNote] = useState('');
  const [locating, setLocating] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (map.current || !holder.current) return;
    map.current = L.map(holder.current, { zoomControl: true, attributionControl: true })
      .setView(OYO_CENTRE, OYO_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  // Clicking drops a pin.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const onClick = (e) => {
      if (readOnly) return;
      onChange([...sites, { lat: e.latlng.lat, lng: e.latlng.lng, label: '' }]);
    };
    m.on('click', onClick);
    return () => m.off('click', onClick);
  }, [sites, onChange, readOnly]);

  // Outline the ward from GRID3 and recentre when it changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !lga || !ward) return;
    let cancelled = false;
    setCentreNote('');
    outline.current?.remove();
    outline.current = null;
    setBoundary(null);
    const q = '?lga=' + encodeURIComponent(lga) + '&ward=' + encodeURIComponent(ward);
    api.get('/geo/ward-boundary' + q)
      .then((b) => {
        if (cancelled || !map.current) return;
        if (b.found) {
          outline.current = L.geoJSON(b.geometry, {
            style: { color: '#0b7a3e', weight: 2, fillOpacity: 0.06 },
            interactive: false,
          }).addTo(map.current);
          setBoundary(b.geometry);
          if (!(readOnly && sites.length)) map.current.fitBounds(outline.current.getBounds().pad(0.05));
          setCentreNote('Ward boundary from GRID3.');
          return;
        }
        return api.get('/geo/ward-centre' + q).then((r) => {
          if (cancelled || !map.current) return;
          if (r.lat != null) {
            map.current.setView([r.lat, r.lng], WARD_ZOOM);
            setCentreNote('Centred on ' + r.members + ' registration'
              + (r.members === 1 ? '' : 's') + ' in this ward.');
          } else {
            map.current.setView(OYO_CENTRE, OYO_ZOOM);
            setCentreNote('No boundary or registrations for this ward yet, so the map cannot '
              + 'centre on it. Pan and zoom to the right place.');
          }
        });
      })
      .catch(() => { if (!cancelled) setCentreNote(''); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lga, ward]);

  // Redraw pins whenever they change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = sites.map((s, i) => {
      const mk = L.marker([s.lat, s.lng], { icon: pinIcon, draggable: !readOnly }).addTo(m);
      if (s.label) mk.bindTooltip(s.label);
      if (!readOnly) {
        mk.on('dragend', () => {
          const p = mk.getLatLng();
          onChange(sites.map((x, xi) => (xi === i ? { ...x, lat: p.lat, lng: p.lng } : x)));
        });
      }
      return mk;
    });
    if (readOnly && sites.length) {
      m.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lng])).pad(0.3), { maxZoom: 15 });
    }
  }, [sites, onChange, readOnly]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        map.current?.setView([latitude, longitude], 16);
        onChange([...sites, { lat: latitude, lng: longitude, label: '' }]);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 });
  };

  const outside = boundary
    ? sites.filter((s) => !inGeometry(boundary, s.lat, s.lng)).length : 0;

  return (
    <div>
      <div ref={holder} style={{ height, borderRadius: 10, overflow: 'hidden' }} />
      {centreNote && <div className="hint" style={{ marginTop: 6 }}>{centreNote}</div>}
      {outside > 0 && (
        <div className="hint" style={{ marginTop: 4, color: 'var(--red-600)' }}>
          {outside === 1 ? '1 pin is' : outside + ' pins are'} outside {ward} ward. Check the
          location, or pick the ward the project is actually in.
        </div>
      )}
      {!readOnly && (
        <div className="btn-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn sm secondary" onClick={useMyLocation} disabled={locating}>
            {locating && <span className="spinner" />} Use my location
          </button>
          {sites.length > 0 && (
            <button type="button" className="btn sm secondary" onClick={() => onChange([])}>
              Clear {sites.length} pin{sites.length === 1 ? '' : 's'}
            </button>
          )}
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
            Tap the map to add a location. Drag a pin to move it.
          </span>
        </div>
      )}
    </div>
  );
}
