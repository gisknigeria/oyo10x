import React, { useState } from 'react';

export const CAMPAIGN = {
  programme: 'OYO 10X',
  strapline: 'People · Places · Possibilities',
  tagline: 'Listen Better. Know the Communities. Act on Evidence.',
  headline: 'Make Oyo 10X Better',
  subhead: 'Community Engagement and Intelligence Network',
  candidate: 'Senator Sharafadeen Alli',
  candidateNote: 'Vision for Oyo State',
  party: 'APC Oyo State',
  period: 'September 2026',
  motto: 'Stronger People · Brighter Oyo',
};

/**
 * The OYO 10X crest. Drawn rather than loaded so the app always has a mark,
 * even before the official artwork is dropped into /public/brand/.
 * If public/brand/logo.png exists it is used in preference to this.
 */
export function Crest({ size = 44, withText = false }) {
  const [useFile, setUseFile] = useState(true);

  if (useFile) {
    return (
      <img
        src="/brand/logo.png" alt="OYO 10X" height={size}
        style={{ height: size, width: 'auto', display: 'block' }}
        onError={() => setUseFile(false)}
      />
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="OYO 10X">
      <defs>
        <linearGradient id="crestGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0D98A" />
          <stop offset="45%" stopColor="#C9A227" />
          <stop offset="100%" stopColor="#8E6D12" />
        </linearGradient>
        <linearGradient id="crestGreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0E4A2B" />
          <stop offset="100%" stopColor="#062E1A" />
        </linearGradient>
      </defs>

      {/* shield */}
      <path d="M50 4 L90 18 V50 C90 72 72 88 50 96 C28 88 10 72 10 50 V18 Z"
            fill="url(#crestGreen)" stroke="url(#crestGold)" strokeWidth="3" />
      <path d="M50 11 L83 22 V50 C83 68 68 82 50 89 C32 82 17 68 17 50 V22 Z"
            fill="none" stroke="url(#crestGold)" strokeWidth="1" opacity=".55" />

      {/* OYO */}
      <text x="50" y="45" textAnchor="middle" fill="#F5EFE2"
            style={{ font: '700 19px Georgia, serif', letterSpacing: '1px' }}>OYO</text>
      {/* 10X */}
      <text x="50" y="68" textAnchor="middle" fill="url(#crestGold)"
            style={{ font: '800 23px Georgia, serif', letterSpacing: '0.5px' }}>10X</text>
      <rect x="30" y="50" width="40" height="1.4" fill="url(#crestGold)" opacity=".8" />
    </svg>
  );
}

/**
 * Candidate portrait. Drop the photograph at client/public/brand/candidate.jpg
 * and it appears automatically; until then a labelled placeholder is shown so
 * no layout depends on the file being present.
 */
export function CandidatePortrait({ className = '' }) {
  const [ok, setOk] = useState(true);

  if (!ok) {
    return (
      <div className={'portrait-placeholder ' + className}>
        <div className="portrait-placeholder-inner">
          <Crest size={52} />
          <div className="portrait-placeholder-text">
            Drop the candidate photograph at
            <code>client/public/brand/candidate.jpg</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      src="/brand/candidate.jpg" alt={CAMPAIGN.candidate}
      className={'portrait ' + className}
      onError={() => setOk(false)}
    />
  );
}

/** Gold rule with a centred diamond, echoing the cover's dividers. */
export function GoldRule({ width = 90 }) {
  return (
    <div className="gold-rule" style={{ width }}>
      <span className="gold-rule-line" />
      <span className="gold-rule-diamond" />
      <span className="gold-rule-line" />
    </div>
  );
}
