// Fixed icon/color vocabulary for POI customization.
// Keep slugs in sync with backend/app/services/poi_parser.py ICON_SLUGS
// (which also maps each slug to a real Google KML shape icon for export —
// see ICON_SLUG_TO_GOOGLE_HREF there).
import {
  Utensils, Droplet, Tent, Stethoscope, Bike, Home, Mountain, ParkingCircle,
  Fuel, TriangleAlert, Camera, Wrench, Bath, BedDouble, Bus, MapPin,
} from 'lucide-react';

export const POI_ICONS = [
  { slug: 'food', Icon: Utensils, label: 'Food' },
  { slug: 'water', Icon: Droplet, label: 'Water' },
  { slug: 'camp', Icon: Tent, label: 'Camp' },
  { slug: 'medical', Icon: Stethoscope, label: 'Medical' },
  { slug: 'bike', Icon: Bike, label: 'Bike' },
  { slug: 'shelter', Icon: Home, label: 'Shelter' },
  { slug: 'viewpoint', Icon: Mountain, label: 'Viewpoint' },
  { slug: 'parking', Icon: ParkingCircle, label: 'Parking' },
  { slug: 'fuel', Icon: Fuel, label: 'Fuel' },
  { slug: 'danger', Icon: TriangleAlert, label: 'Danger' },
  { slug: 'photo', Icon: Camera, label: 'Photo' },
  { slug: 'repair', Icon: Wrench, label: 'Repair' },
  { slug: 'toilet', Icon: Bath, label: 'Toilet' },
  { slug: 'lodging', Icon: BedDouble, label: 'Lodging' },
  { slug: 'transport', Icon: Bus, label: 'Transport' },
  { slug: 'other', Icon: MapPin, label: 'Other' },
];

export const POI_ICON_COMPONENT = Object.fromEntries(POI_ICONS.map((i) => [i.slug, i.Icon]));
export const DEFAULT_POI_ICON = MapPin;

// Matches the Google My Maps marker color grid (screenshot reference):
// a saturated row, a pastel row of the same hues, then a grayscale row.
export const POI_COLOR_SWATCHES = [
  // Saturated
  '#b0120a', '#dd4b39', '#ff6600', '#ff9900', '#ffcc00',
  '#009688', '#0f9d58', '#00bcd4', '#4986e8', '#0d47a1', '#7b1fa2',
  // Pastel
  '#e6b8af', '#f4c7c3', '#ffc794', '#ffe0b2', '#fff2ac',
  '#b2dfdb', '#b7e1cd', '#b2ebf2', '#c9daf8', '#a4c2f4', '#d5a6bd',
  // Grayscale
  '#000000', '#434343', '#999999', '#d9d9d9', '#ffffff',
];

export const DEFAULT_POI_COLOR = '#8e8e93';
