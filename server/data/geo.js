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
/**
 * CORRECTED 2026-09-22 against the campaign office's ward master workbook.
 *
 * Four LGAs were on the wrong side: Ibadan North and Ibadan North-East were
 * listed under Oyo Central, and Oluyole and Ona Ara under Oyo South. They are
 * the other way round. That mis-scoped all three Senate candidates.
 *
 * The workbook is self-consistent on this -- its 351 ward rows total 118 /
 * 134 / 99 per district, matching its own boundary sheet and PLAC/Situation
 * Room. The previous grouping produced 121 / 134 / 96, and the 3-ward
 * difference is exactly these four LGAs swapping sides.
 */
export const SENATORIAL = {
  'Oyo South': [
    'Ibadan North', 'Ibadan North-East', 'Ibadan North-West',
    'Ibadan South-East', 'Ibadan South-West',
    'Ibarapa Central', 'Ibarapa East', 'Ibarapa North', 'Ido',
  ],
  'Oyo Central': [
    'Afijio', 'Akinyele', 'Atiba', 'Egbeda', 'Lagelu', 'Ogo Oluwa',
    'Oluyole', 'Ona Ara', 'Oyo East', 'Oyo West', 'Surulere',
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
/**
 * The 32 Oyo State House of Assembly constituencies, as named on the campaign
 * office's official candidate list.
 *
 * This was previously generated as one constituency per LGA, which was a
 * convenient fiction: the real boundaries split some LGAs in two (Akinyele I
 * and II, Ibadan North I and II) and merge others (Irepo/Olorunsogo,
 * Saki/Atisbo). The generated version produced names no candidate's record
 * matched, so State Assembly candidates resolved to no LGAs at all and signed
 * in to an empty dashboard.
 *
 * The keys here must stay byte-identical to the scope_value strings in
 * data/candidates.js -- that is what links a candidate's login to the area
 * they can see.
 *
 * KNOWN LIMITATION: members are stored with an LGA, not a constituency, so
 * where two constituencies share one LGA they necessarily resolve to the same
 * members. Two effects follow, both unavoidable without ward-to-constituency
 * boundaries the campaign has not supplied:
 *   - Akinyele I and Akinyele II candidates each see all of Akinyele.
 *   - Rolling member counts up per constituency counts a shared LGA once for
 *     each constituency, so those totals overlap and must not be summed.
 */
export const STATE_CONST = {
  Afijio: ['Afijio'],
  'Akinyele I': ['Akinyele'],
  'Akinyele II': ['Akinyele'],
  Atiba: ['Atiba'],
  Egbeda: ['Egbeda'],
  'Ibadan North East I': ['Ibadan North-East'],
  'Ibadan North East II': ['Ibadan North-East'],
  'Ibadan North I': ['Ibadan North'],
  'Ibadan North II': ['Ibadan North'],
  'Ibadan North West': ['Ibadan North-West'],
  'Ibadan South East I': ['Ibadan South-East'],
  'Ibadan South East II': ['Ibadan South-East'],
  'Ibadan South West I': ['Ibadan South-West'],
  'Ibadan South West II': ['Ibadan South-West'],
  'Ibarapa East': ['Ibarapa East'],
  'Ibarapa North/Ibarapa Central': ['Ibarapa North', 'Ibarapa Central'],
  Ido: ['Ido'],
  'Irepo/Olorunsogo': ['Irepo', 'Olorunsogo'],
  'Iseyin/Itesiwaju': ['Iseyin', 'Itesiwaju'],
  Iwajowa: ['Iwajowa'],
  Kajola: ['Kajola'],
  Lagelu: ['Lagelu'],
  'Ogbomoso North': ['Ogbomosho North'],
  'Ogbomoso South': ['Ogbomosho South'],
  Oluyole: ['Oluyole'],
  'Ona-Ara': ['Ona Ara'],
  Orelope: ['Orelope'],
  Oriire: ['Ori Ire'],
  'Oyo East/Oyo West': ['Oyo East', 'Oyo West'],
  'Saki West': ['Saki West'],
  'Saki/Atisbo': ['Saki East', 'Atisbo'],
  'Surulere/Ogo-Oluwa': ['Surulere', 'Ogo Oluwa'],
};

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
