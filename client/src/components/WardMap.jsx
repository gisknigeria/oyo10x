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

/**
 * Tap-to-drop map for choosing where a project goes.
 *
 * There is no ward boundary data anywhere in this system, so the map cannot
 * outline a ward. It centres on the average position of people already
 * registered in that ward, which is real data and accurate wherever anyone
 * has been registered. Wards with no registrations open on the whole state
 * and the user pans -- shown honestly rather than pretending to know.
 */
export default function WardMap({ lga, ward, sites, onChange, readOnly = false, height = 320 }) {
  const holder = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
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

  // Recentre when the ward changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !lga || !ward) return;
    let cancelled = false;
    setCentreNote('');
    api.get('/geo/ward-centre?lga=' + encodeURIComponent(lga) + '&ward=' + encodeURIComponent(ward))
      .then((r) => {
        if (cancelled || !map.current) return;
        if (r.lat != null) {
          map.current.setView([r.lat, r.lng], WARD_ZOOM);
          setCentreNote('Centred on ' + r.members + ' registration'
            + (r.members === 1 ? '' : 's') + ' in this ward.');
        } else {
          map.current.setView(OYO_CENTRE, OYO_ZOOM);
          setCentreNote('Nobody is registered in this ward yet, so the map cannot '
            + 'centre on it. Pan and zoom to the right place.');
        }
      })
      .catch(() => { if (!cancelled) setCentreNote(''); });
    return () => { cancelled = true; };
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

  return (
    <div>
      <div ref={holder} style={{ height, borderRadius: 10, overflow: 'hidden' }} />
      {centreNote && <div className="hint" style={{ marginTop: 6 }}>{centreNote}</div>}
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
