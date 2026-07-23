// Fixed icon/color vocabulary for POI customization.
// Keep slugs in sync with backend/app/services/poi_parser.py ICON_SLUGS.

export const POI_ICONS = [
  { slug: 'food', emoji: '🍴', label: 'Food' },
  { slug: 'water', emoji: '💧', label: 'Water' },
  { slug: 'camp', emoji: '⛺', label: 'Camp' },
  { slug: 'medical', emoji: '🏥', label: 'Medical' },
  { slug: 'bike', emoji: '🚲', label: 'Bike' },
  { slug: 'shelter', emoji: '🏔️', label: 'Shelter' },
  { slug: 'viewpoint', emoji: '🌄', label: 'Viewpoint' },
  { slug: 'parking', emoji: '🅿️', label: 'Parking' },
  { slug: 'fuel', emoji: '⛽', label: 'Fuel' },
  { slug: 'danger', emoji: '⚠️', label: 'Danger' },
  { slug: 'photo', emoji: '📸', label: 'Photo' },
  { slug: 'repair', emoji: '🔧', label: 'Repair' },
  { slug: 'toilet', emoji: '🚻', label: 'Toilet' },
  { slug: 'lodging', emoji: '🛏️', label: 'Lodging' },
  { slug: 'transport', emoji: '🚌', label: 'Transport' },
  { slug: 'other', emoji: '📍', label: 'Other' },
];

export const POI_ICON_EMOJI = Object.fromEntries(POI_ICONS.map((i) => [i.slug, i.emoji]));

export const POI_COLOR_SWATCHES = [
  '#ff9500', '#007aff', '#34c759', '#ff3b30', '#af52de', '#5856d6',
  '#ff2d55', '#64d2ff', '#a2845e', '#8e8e93', '#bf5af2', '#30b050',
];

export const DEFAULT_POI_COLOR = '#8e8e93';
