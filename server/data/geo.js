// Oyo State geographic + electoral reference data.
//
import { OYO_POLLING_DATA } from './oyoPollingData.js';

// LGA and constituency names are kept in the app's display format. Ward and
// polling-unit names come from the extracted Oyo State polling dataset.

export const LGAS = [
  'Afijio', 'Akinyele', 'Atiba', 'Atisbo', 'Egbeda',
  'Ibadan North', 'Ibadan North-East', 'Ibadan North-West',
  'Ibadan South-East', 'Ibadan South-West',
  'Ibarapa Central', 'Ibarapa East', 'Ibarapa North', 'Ido',
  'Irepo', 'Iseyin', 'Itesiwaju', 'Iwajowa', 'Kajola', 'Lagelu',
  'Ogbomosho North', 'Ogbomosho South', 'Ogo Oluwa', 'Olorunsogo',
  'Oluyole', 'Ona Ara', 'Orelope', 'Ori Ire', 'Oyo East', 'Oyo West',
  'Saki East', 'Saki West', 'Surulere',
];

// VERIFY against INEC before go-live.
export const SENATORIAL = {
  'Oyo South': [
    'Ibadan North-West', 'Ibadan South-East', 'Ibadan South-West',
    'Ibarapa Central', 'Ibarapa East', 'Ibarapa North', 'Ido',
    'Oluyole', 'Ona Ara',
  ],
  'Oyo Central': [
    'Afijio', 'Akinyele', 'Atiba', 'Egbeda', 'Ibadan North',
    'Ibadan North-East', 'Lagelu', 'Ogo Oluwa', 'Oyo East',
    'Oyo West', 'Surulere',
  ],
  'Oyo North': [
    'Atisbo', 'Irepo', 'Iseyin', 'Itesiwaju', 'Iwajowa', 'Kajola',
    'Ogbomosho North', 'Ogbomosho South', 'Olorunsogo', 'Orelope',
    'Ori Ire', 'Saki East', 'Saki West',
  ],
};

export const FEDERAL = {
  'Afijio/Atiba/Oyo East/Oyo West': ['Afijio', 'Atiba', 'Oyo East', 'Oyo West'],
  'Akinyele/Lagelu': ['Akinyele', 'Lagelu'],
  'Atisbo/Saki East/Saki West': ['Atisbo', 'Saki East', 'Saki West'],
  'Egbeda/Ona Ara': ['Egbeda', 'Ona Ara'],
  'Ibadan North': ['Ibadan North'],
  'Ibadan North-East/Ibadan South-East': ['Ibadan North-East', 'Ibadan South-East'],
  'Ibadan North-West/Ibadan South-West': ['Ibadan North-West', 'Ibadan South-West'],
  'Ibarapa Central/Ibarapa North': ['Ibarapa Central', 'Ibarapa North'],
  'Ibarapa East/Ido': ['Ibarapa East', 'Ido'],
  'Irepo/Olorunsogo/Orelope': ['Irepo', 'Olorunsogo', 'Orelope'],
  'Iseyin/Itesiwaju/Kajola/Iwajowa': ['Iseyin', 'Itesiwaju', 'Kajola', 'Iwajowa'],
  'Ogbomosho North/Ogbomosho South/Ori Ire': ['Ogbomosho North', 'Ogbomosho South', 'Ori Ire'],
  'Ogo Oluwa/Surulere': ['Ogo Oluwa', 'Surulere'],
  'Oluyole': ['Oluyole'],
};

// 32 State Assembly constituencies: one per LGA, with Ogo Oluwa/Surulere paired.
export const STATE_CONST = (() => {
  const out = {};
  for (const lga of LGAS) {
    if (lga === 'Ogo Oluwa' || lga === 'Surulere') continue;
    out[`${lga} State Constituency`] = [lga];
  }
  out['Ogo Oluwa/Surulere State Constituency'] = ['Ogo Oluwa', 'Surulere'];
  return out;
})();

const normaliseLga = (value) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const sourceLga = Object.fromEntries(Object.keys(OYO_POLLING_DATA.lgas)
  .map((name) => [normaliseLga(name), name]));
sourceLga.ORELOPE = sourceLga.OORELOPE;
sourceLga.OGBOMOSHONORTH = sourceLga.OGBOMOSONORTH;
sourceLga.OGBOMOSHOSOUTH = sourceLga.OGBOMOSOSOUTH;

const sourceFor = (lga) => {
  const key = sourceLga[normaliseLga(lga)];
  if (!key) throw new Error('Missing Oyo polling data for LGA: ' + lga);
  return OYO_POLLING_DATA.lgas[key].wards;
};

export const POLLING_UNITS = Object.fromEntries(LGAS.map((lga) => [lga, sourceFor(lga)]));
export const WARDS = Object.fromEntries(LGAS.map((lga) => [lga, Object.keys(POLLING_UNITS[lga])]));

export const TOTAL_WARDS = Object.values(WARDS).reduce((a, w) => a + w.length, 0);
export const TOTAL_POLLING_UNITS = Object.values(POLLING_UNITS)
  .flatMap((wards) => Object.values(wards).flat()).length;

export const BANKS = [
  'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank',
  'First Bank of Nigeria', 'First City Monument Bank (FCMB)', 'Globus Bank',
  'Guaranty Trust Bank (GTB)', 'Heritage Bank', 'Jaiz Bank', 'Keystone Bank',
  'Kuda Microfinance Bank', 'Lotus Bank', 'Moniepoint MFB', 'Opay (Paycom)',
  'Palmpay', 'Parallex Bank', 'Polaris Bank', 'Premium Trust Bank',
  'Providus Bank', 'Stanbic IBTC Bank', 'Standard Chartered Bank',
  'Sterling Bank', 'SunTrust Bank', 'TAJBank', 'Titan Trust Bank',
  'Union Bank of Nigeria', 'United Bank for Africa (UBA)', 'Unity Bank',
  'VFD Microfinance Bank', 'Wema Bank', 'Zenith Bank',
];

export function lgasForScope(scopeType, scopeValue) {
  if (scopeType === 'state' || !scopeValue) return LGAS;
  if (scopeType === 'senatorial') return SENATORIAL[scopeValue] || [];
  if (scopeType === 'federal') return FEDERAL[scopeValue] || [];
  if (scopeType === 'state_const') return STATE_CONST[scopeValue] || [];
  if (scopeType === 'lga') return [scopeValue];
  return LGAS;
}
