export type SizingSystemMode = 'us' | 'eu' | 'uk';
export type PersonaTarget = 'men' | 'women' | 'kid';
export type ParentCategoryKey = 'tops' | 'bottoms' | 'footwear' | 'outerwear' | 'dresses';

export interface MultiSystemRow {
  sizeLabel: string;
  usSize: string;
  euSize: string;
  ukSize: string;
  chestMin?: number;
  chestMax?: number;
  waistMin?: number;
  waistMax?: number;
  hipsMin?: number;
  hipsMax?: number;
  heightMin?: number;
  heightMax?: number;
  footLengthMin?: number;
  footLengthMax?: number;
  ageMin?: number;
  ageMax?: number;
  ageLabel?: string;
  chestCm?: string;
  chestIn?: string;
  waistCm?: string;
  waistIn?: string;
  hipsCm?: string;
  hipsIn?: string;
  lengthCm?: string;
  lengthIn?: string;
  footLengthCm?: string;
  footLengthIn?: string;
  sleeveCm?: string;
  sleeveIn?: string;
  inseamCm?: string;
  inseamIn?: string;
  fitNote?: string;
}

export interface BrandSubCategory {
  id: string;
  name: string;
  fitType: 'True to Size' | 'Athletic / Slim' | 'Relaxed / Oversized' | 'Standard Denim' | 'Snug Fit';
  fitDescription: string;
  rowsByPersona: {
    men?: MultiSystemRow[];
    women?: MultiSystemRow[];
    kid?: MultiSystemRow[];
  };
}

export interface BrandCategory {
  key: ParentCategoryKey;
  label: string;
  subcategories: BrandSubCategory[];
}

export interface TesterBrand {
  id: string;
  name: string;
  type: 'global' | 'private';
  logoInitials: string;
  accentColor: string;
  confidence: number;
  skuCount: number;
  sourceNote: string;
  fitPhilosophy: string;
  categories: BrandCategory[];
}

// ---------------------------------------------------------------------------
// Comprehensive Brand Sizing Catalog
// ---------------------------------------------------------------------------
export const TESTER_BRANDS: TesterBrand[] = [
  // =========================================================================
  // 1. NIKE
  // =========================================================================
  {
    id: 'nike',
    name: 'Nike',
    type: 'global',
    logoInitials: 'NK',
    accentColor: 'from-orange-500 to-amber-600',
    confidence: 99.4,
    skuCount: 18,
    sourceNote: 'Official Manufacturer Source (Nike.com/size-guide)',
    fitPhilosophy: 'Athletic cut with ergonomic movement tolerance. Tops run true to size; footwear fits snug through the midfoot.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'nike-tops-tees',
            name: 'T-Shirts & Polos',
            fitType: 'True to Size',
            fitDescription: 'Standard athletic regular fit with clean ribbed collar and dropped shoulder ease.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'XS', usSize: 'US XS (34)', euSize: 'EU 44', ukSize: 'UK 34', chestMin: 80, chestMax: 88, waistMin: 65, waistMax: 73, chestCm: '80–88', chestIn: '31.5–34.5', waistCm: '65–73', waistIn: '25.5–29.0', lengthCm: '68', lengthIn: '26.8', fitNote: 'Slim Contour' },
                { sizeLabel: 'S', usSize: 'US S (36–38)', euSize: 'EU 46–48', ukSize: 'UK 36–38', chestMin: 88, chestMax: 96, waistMin: 73, waistMax: 81, chestCm: '88–96', chestIn: '34.5–38.0', waistCm: '73–81', waistIn: '29.0–32.0', lengthCm: '70', lengthIn: '27.5', fitNote: 'Standard Fit' },
                { sizeLabel: 'M', usSize: 'US M (40)', euSize: 'EU 50', ukSize: 'UK 40', chestMin: 96, chestMax: 104, waistMin: 81, waistMax: 89, chestCm: '96–104', chestIn: '38.0–41.0', waistCm: '81–89', waistIn: '32.0–35.0', lengthCm: '72', lengthIn: '28.3', fitNote: 'Optimal Athletic' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 104, chestMax: 112, waistMin: 89, waistMax: 97, chestCm: '104–112', chestIn: '41.0–44.0', waistCm: '89–97', waistIn: '35.0–38.0', lengthCm: '74', lengthIn: '29.1', fitNote: 'Roomy Comfort' },
                { sizeLabel: 'XL', usSize: 'US XL (46)', euSize: 'EU 56', ukSize: 'UK 46', chestMin: 112, chestMax: 124, waistMin: 97, waistMax: 109, chestCm: '112–124', chestIn: '44.0–49.0', waistCm: '97–109', waistIn: '38.0–43.0', lengthCm: '76', lengthIn: '29.9', fitNote: 'Relaxed Silhouette' },
                { sizeLabel: 'XXL', usSize: 'US 2XL (48–50)', euSize: 'EU 58–60', ukSize: 'UK 48–50', chestMin: 124, chestMax: 136, waistMin: 109, waistMax: 121, chestCm: '124–136', chestIn: '49.0–53.5', waistCm: '109–121', waistIn: '43.0–47.5', lengthCm: '78', lengthIn: '30.7', fitNote: 'Generous Drape' },
              ],
              women: [
                { sizeLabel: 'XS', usSize: 'US 0–2 (XS)', euSize: 'EU 32–34', ukSize: 'UK 4–6', chestMin: 76, chestMax: 83, waistMin: 60, waistMax: 67, hipsMin: 84, hipsMax: 91, chestCm: '76–83', chestIn: '30.0–32.5', waistCm: '60–67', waistIn: '23.5–26.5', hipsCm: '84–91', hipsIn: '33.0–36.0', fitNote: 'Form-Fitting' },
                { sizeLabel: 'S', usSize: 'US 4–6 (S)', euSize: 'EU 36–38', ukSize: 'UK 8–10', chestMin: 83, chestMax: 90, waistMin: 67, waistMax: 74, hipsMin: 91, hipsMax: 98, chestCm: '83–90', chestIn: '32.5–35.5', waistCm: '67–74', waistIn: '26.5–29.0', hipsCm: '91–98', hipsIn: '36.0–38.5', fitNote: 'True to Size' },
                { sizeLabel: 'M', usSize: 'US 8–10 (M)', euSize: 'EU 40–42', ukSize: 'UK 12–14', chestMin: 90, chestMax: 97, waistMin: 74, waistMax: 81, hipsMin: 98, hipsMax: 105, chestCm: '90–97', chestIn: '35.5–38.0', waistCm: '74–81', waistIn: '29.0–32.0', hipsCm: '98–105', hipsIn: '38.5–41.5', fitNote: 'Natural Fit' },
                { sizeLabel: 'L', usSize: 'US 12–14 (L)', euSize: 'EU 44–46', ukSize: 'UK 16–18', chestMin: 97, chestMax: 104, waistMin: 81, waistMax: 88, hipsMin: 105, hipsMax: 112, chestCm: '97–104', chestIn: '38.0–41.0', waistCm: '81–88', waistIn: '32.0–34.5', hipsCm: '105–112', hipsIn: '41.5–44.0', fitNote: 'Relaxed Fit' },
                { sizeLabel: 'XL', usSize: 'US 16–18 (XL)', euSize: 'EU 48–50', ukSize: 'UK 20–22', chestMin: 104, chestMax: 114, waistMin: 88, waistMax: 98, hipsMin: 112, hipsMax: 120, chestCm: '104–114', chestIn: '41.0–45.0', waistCm: '88–98', waistIn: '34.5–38.5', hipsCm: '112–120', hipsIn: '44.0–47.0', fitNote: 'Comfort Cut' },
              ],
              kid: [
                { sizeLabel: 'XS (6-7Y)', usSize: 'US 6-7 (XS)', euSize: 'EU 116–122', ukSize: 'UK 6-7Y', heightMin: 116, heightMax: 122, chestMin: 59, chestMax: 63, ageMin: 6, ageMax: 7, chestCm: '59–63', chestIn: '23.0–24.8', lengthCm: '48', lengthIn: '18.9', fitNote: 'Little Kids' },
                { sizeLabel: 'S (8-9Y)', usSize: 'US 8 (S)', euSize: 'EU 128–137', ukSize: 'UK 8-9Y', heightMin: 128, heightMax: 137, chestMin: 64, chestMax: 69, ageMin: 8, ageMax: 9, chestCm: '64–69', chestIn: '25.0–27.0', lengthCm: '52', lengthIn: '20.5', fitNote: 'Youth Standard' },
                { sizeLabel: 'M (10-12Y)', usSize: 'US 10-12 (M)', euSize: 'EU 137–147', ukSize: 'UK 10-12Y', heightMin: 137, heightMax: 147, chestMin: 69, chestMax: 75, ageMin: 10, ageMax: 12, chestCm: '69–75', chestIn: '27.0–29.5', lengthCm: '56', lengthIn: '22.0', fitNote: 'Youth Optimal' },
                { sizeLabel: 'L (12-13Y)', usSize: 'US 14 (L)', euSize: 'EU 147–158', ukSize: 'UK 13-14Y', heightMin: 147, heightMax: 158, chestMin: 75, chestMax: 82, ageMin: 12, ageMax: 13, chestCm: '75–82', chestIn: '29.5–32.0', lengthCm: '60', lengthIn: '23.6', fitNote: 'Teen Cut' },
              ],
            },
          },
          {
            id: 'nike-tops-hoodies',
            name: 'Hoodies & Fleece (Club / Tech)',
            fitType: 'Relaxed / Oversized',
            fitDescription: 'Cut with +3cm additional chest allowance to comfortably layer over base tees.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36–38)', euSize: 'EU 46–48', ukSize: 'UK 36–38', chestMin: 90, chestMax: 98, waistMin: 74, waistMax: 82, chestCm: '90–98', chestIn: '35.5–38.5', lengthCm: '69', lengthIn: '27.2', fitNote: 'Slightly Relaxed' },
                { sizeLabel: 'M', usSize: 'US M (40)', euSize: 'EU 50', ukSize: 'UK 40', chestMin: 98, chestMax: 106, waistMin: 82, waistMax: 90, chestCm: '98–106', chestIn: '38.5–41.5', lengthCm: '71', lengthIn: '28.0', fitNote: 'Tech Layering' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 106, chestMax: 114, waistMin: 90, waistMax: 98, chestCm: '106–114', chestIn: '41.5–45.0', lengthCm: '73', lengthIn: '28.7', fitNote: 'Comfort Pullover' },
                { sizeLabel: 'XL', usSize: 'US XL (46)', euSize: 'EU 56', ukSize: 'UK 46', chestMin: 114, chestMax: 126, waistMin: 98, waistMax: 110, chestCm: '114–126', chestIn: '45.0–49.5', lengthCm: '75', lengthIn: '29.5', fitNote: 'Oversized Street' },
              ],
            },
          },
        ],
      },
      {
        key: 'bottoms',
        label: 'Bottoms',
        subcategories: [
          {
            id: 'nike-bottoms-joggers',
            name: 'Joggers & Sweatpants',
            fitType: 'Athletic / Slim',
            fitDescription: 'Tapered below the knee with ribbed ankle cuffs and elastic drawstring waistband.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US 29–31W', euSize: 'EU 44–46', ukSize: 'UK 30R', waistMin: 73, waistMax: 81, hipsMin: 88, hipsMax: 96, waistCm: '73–81', waistIn: '29.0–32.0', hipsCm: '88–96', hipsIn: '34.5–38.0', inseamCm: '77', inseamIn: '30.3', fitNote: 'Athletic Taper' },
                { sizeLabel: 'M', usSize: 'US 32–34W', euSize: 'EU 48–50', ukSize: 'UK 32R', waistMin: 81, waistMax: 89, hipsMin: 96, hipsMax: 104, waistCm: '81–89', waistIn: '32.0–35.0', hipsCm: '96–104', hipsIn: '38.0–41.0', inseamCm: '78', inseamIn: '30.7', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US 35–37W', euSize: 'EU 52–54', ukSize: 'UK 34R', waistMin: 89, waistMax: 97, hipsMin: 104, hipsMax: 112, waistCm: '89–97', waistIn: '35.0–38.0', hipsCm: '104–112', hipsIn: '41.0–44.0', inseamCm: '79', inseamIn: '31.1', fitNote: 'Relaxed Taper' },
                { sizeLabel: 'XL', usSize: 'US 38–41W', euSize: 'EU 56–58', ukSize: 'UK 36R', waistMin: 97, waistMax: 109, hipsMin: 112, hipsMax: 120, waistCm: '97–109', waistIn: '38.0–43.0', hipsCm: '112–120', hipsIn: '44.0–47.0', inseamCm: '80', inseamIn: '31.5', fitNote: 'Roomy Leg' },
              ],
            },
          },
        ],
      },
      {
        key: 'footwear',
        label: 'Footwear',
        subcategories: [
          {
            id: 'nike-footwear-running',
            name: 'Running Shoes (Pegasus / Infinity)',
            fitType: 'Snug Fit',
            fitDescription: 'Engineered performance mesh with structured heel cup. Recommendation: order half size up for wider feet.',
            rowsByPersona: {
              men: [
                { sizeLabel: '8.0', usSize: 'US 8.0', euSize: 'EU 41.0', ukSize: 'UK 7.0', footLengthMin: 25.5, footLengthMax: 26.0, footLengthCm: '26.0', footLengthIn: '10.2', fitNote: 'D - Medium Width' },
                { sizeLabel: '8.5', usSize: 'US 8.5', euSize: 'EU 42.0', ukSize: 'UK 7.5', footLengthMin: 26.1, footLengthMax: 26.5, footLengthCm: '26.5', footLengthIn: '10.4', fitNote: 'D - Medium Width' },
                { sizeLabel: '9.0', usSize: 'US 9.0', euSize: 'EU 42.5', ukSize: 'UK 8.0', footLengthMin: 26.6, footLengthMax: 27.0, footLengthCm: '27.0', footLengthIn: '10.6', fitNote: 'D - Medium Width' },
                { sizeLabel: '9.5', usSize: 'US 9.5', euSize: 'EU 43.0', ukSize: 'UK 8.5', footLengthMin: 27.1, footLengthMax: 27.5, footLengthCm: '27.5', footLengthIn: '10.8', fitNote: 'D - Medium Width' },
                { sizeLabel: '10.0', usSize: 'US 10.0', euSize: 'EU 44.0', ukSize: 'UK 9.0', footLengthMin: 27.6, footLengthMax: 28.0, footLengthCm: '28.0', footLengthIn: '11.0', fitNote: 'D - Medium Width' },
                { sizeLabel: '10.5', usSize: 'US 10.5', euSize: 'EU 44.5', ukSize: 'UK 9.5', footLengthMin: 28.1, footLengthMax: 28.5, footLengthCm: '28.5', footLengthIn: '11.2', fitNote: 'D - Medium Width' },
                { sizeLabel: '11.0', usSize: 'US 11.0', euSize: 'EU 45.0', ukSize: 'UK 10.0', footLengthMin: 28.6, footLengthMax: 29.0, footLengthCm: '29.0', footLengthIn: '11.4', fitNote: 'D - Medium Width' },
                { sizeLabel: '12.0', usSize: 'US 12.0', euSize: 'EU 46.0', ukSize: 'UK 11.0', footLengthMin: 29.5, footLengthMax: 30.0, footLengthCm: '30.0', footLengthIn: '11.8', fitNote: 'D - Medium Width' },
              ],
              women: [
                { sizeLabel: '6.0', usSize: 'US 6.0', euSize: 'EU 36.5', ukSize: 'UK 3.5', footLengthMin: 22.5, footLengthMax: 23.0, footLengthCm: '23.0', footLengthIn: '9.0', fitNote: 'B - Standard' },
                { sizeLabel: '7.0', usSize: 'US 7.0', euSize: 'EU 38.0', ukSize: 'UK 4.5', footLengthMin: 23.5, footLengthMax: 24.0, footLengthCm: '24.0', footLengthIn: '9.4', fitNote: 'B - Standard' },
                { sizeLabel: '8.0', usSize: 'US 8.0', euSize: 'EU 39.0', ukSize: 'UK 5.5', footLengthMin: 24.5, footLengthMax: 25.0, footLengthCm: '25.0', footLengthIn: '9.8', fitNote: 'B - Standard' },
                { sizeLabel: '9.0', usSize: 'US 9.0', euSize: 'EU 40.5', ukSize: 'UK 6.5', footLengthMin: 25.5, footLengthMax: 26.0, footLengthCm: '26.0', footLengthIn: '10.2', fitNote: 'B - Standard' },
              ],
              kid: [
                { sizeLabel: '11C', usSize: 'US 11C', euSize: 'EU 28.0', ukSize: 'UK 10.5', ageMin: 5, ageMax: 6, footLengthMin: 16.5, footLengthMax: 17.2, footLengthCm: '17.0', footLengthIn: '6.7', fitNote: 'Kids Standard' },
                { sizeLabel: '13C', usSize: 'US 13C', euSize: 'EU 31.0', ukSize: 'UK 12.5', ageMin: 6, ageMax: 7, footLengthMin: 18.2, footLengthMax: 19.0, footLengthCm: '19.0', footLengthIn: '7.5', fitNote: 'Kids Standard' },
                { sizeLabel: '2Y', usSize: 'US 2Y', euSize: 'EU 33.5', ukSize: 'UK 1.5', ageMin: 8, ageMax: 9, footLengthMin: 20.0, footLengthMax: 20.8, footLengthCm: '20.8', footLengthIn: '8.2', fitNote: 'Youth Standard' },
                { sizeLabel: '4Y', usSize: 'US 4Y', euSize: 'EU 36.0', ukSize: 'UK 3.5', ageMin: 10, ageMax: 11, footLengthMin: 22.0, footLengthMax: 22.8, footLengthCm: '22.8', footLengthIn: '9.0', fitNote: 'Youth Standard' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 2. ADIDAS
  // =========================================================================
  {
    id: 'adidas',
    name: 'Adidas',
    type: 'global',
    logoInitials: 'AD',
    accentColor: 'from-blue-600 to-indigo-700',
    confidence: 98.8,
    skuCount: 14,
    sourceNote: 'Official Manufacturer Source (Adidas.com/size-charts)',
    fitPhilosophy: 'European athletic precision. Tops feature streamlined shoulders; footwear runs true to length with adaptive toe box.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'adidas-tops-track',
            name: 'Track Tops & T-Shirts',
            fitType: 'True to Size',
            fitDescription: 'Iconic Trefoil silhouette with raglan sleeve ease and ribbed collar.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (34–36)', euSize: 'EU 46', ukSize: 'UK 34–36', chestMin: 87, chestMax: 92, waistMin: 75, waistMax: 80, chestCm: '87–92', chestIn: '34.0–36.0', waistCm: '75–80', waistIn: '29.5–31.5', sleeveCm: '83.5', sleeveIn: '32.8', fitNote: 'Athletic Cut' },
                { sizeLabel: 'M', usSize: 'US M (38–40)', euSize: 'EU 48–50', ukSize: 'UK 38–40', chestMin: 93, chestMax: 100, waistMin: 81, waistMax: 88, chestCm: '93–100', chestIn: '36.5–39.5', waistCm: '81–88', waistIn: '32.0–34.5', sleeveCm: '85.0', sleeveIn: '33.5', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 101, chestMax: 108, waistMin: 89, waistMax: 96, chestCm: '101–108', chestIn: '40.0–42.5', waistCm: '89–96', waistIn: '35.0–38.0', sleeveCm: '86.5', sleeveIn: '34.0', fitNote: 'Comfort Cut' },
                { sizeLabel: 'XL', usSize: 'US XL (46–48)', euSize: 'EU 56–58', ukSize: 'UK 46–48', chestMin: 109, chestMax: 118, waistMin: 97, waistMax: 106, chestCm: '109–118', chestIn: '43.0–46.5', waistCm: '97–106', waistIn: '38.5–41.5', sleeveCm: '88.0', sleeveIn: '34.6', fitNote: 'Relaxed Silhouette' },
              ],
            },
          },
        ],
      },
      {
        key: 'footwear',
        label: 'Footwear',
        subcategories: [
          {
            id: 'adidas-footwear-sneakers',
            name: 'Running & Lifestyle (Ultraboost / Samba)',
            fitType: 'True to Size',
            fitDescription: 'Standard continental width with locked-down midfoot cage.',
            rowsByPersona: {
              men: [
                { sizeLabel: '8.0', usSize: 'US 8.0', euSize: 'EU 41.3', ukSize: 'UK 7.5', footLengthMin: 25.5, footLengthMax: 26.0, footLengthCm: '25.9', footLengthIn: '10.2', fitNote: 'Standard Width' },
                { sizeLabel: '9.0', usSize: 'US 9.0', euSize: 'EU 42.7', ukSize: 'UK 8.5', footLengthMin: 26.4, footLengthMax: 27.0, footLengthCm: '26.7', footLengthIn: '10.5', fitNote: 'Standard Width' },
                { sizeLabel: '10.0', usSize: 'US 10.0', euSize: 'EU 44.0', ukSize: 'UK 9.5', footLengthMin: 27.2, footLengthMax: 27.8, footLengthCm: '27.6', footLengthIn: '10.8', fitNote: 'Standard Width' },
                { sizeLabel: '11.0', usSize: 'US 11.0', euSize: 'EU 45.3', ukSize: 'UK 10.5', footLengthMin: 28.0, footLengthMax: 28.6, footLengthCm: '28.4', footLengthIn: '11.2', fitNote: 'Standard Width' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 3. LEVI'S
  // =========================================================================
  {
    id: 'levis',
    name: "Levi's",
    type: 'global',
    logoInitials: 'LV',
    accentColor: 'from-red-600 to-rose-700',
    confidence: 99.1,
    skuCount: 10,
    sourceNote: 'Official Denim Guide (Levis.com/fit-guide)',
    fitPhilosophy: 'Non-stretch and low-stretch heritage denim. Waist sizes refer directly to waistband circumference in inches.',
    categories: [
      {
        key: 'bottoms',
        label: 'Bottoms',
        subcategories: [
          {
            id: 'levis-bottoms-501',
            name: '501 Original Straight Jeans',
            fitType: 'Standard Denim',
            fitDescription: 'The original straight leg with authentic button fly. Sits at the natural waist.',
            rowsByPersona: {
              men: [
                { sizeLabel: '29', usSize: 'US 29W x 32L', euSize: 'EU 44', ukSize: 'UK 29R', waistMin: 72, waistMax: 75, hipsMin: 88, hipsMax: 92, waistCm: '73.5–75.0', waistIn: '29.0–29.5', hipsCm: '90.0', hipsIn: '35.5', inseamCm: '81', inseamIn: '32.0', fitNote: 'Classic 501' },
                { sizeLabel: '30', usSize: 'US 30W x 32L', euSize: 'EU 46', ukSize: 'UK 30R', waistMin: 75, waistMax: 78, hipsMin: 91, hipsMax: 94, waistCm: '76.0–77.5', waistIn: '30.0–30.5', hipsCm: '92.5', hipsIn: '36.5', inseamCm: '81', inseamIn: '32.0', fitNote: 'Classic 501' },
                { sizeLabel: '32', usSize: 'US 32W x 32L', euSize: 'EU 48', ukSize: 'UK 32R', waistMin: 80, waistMax: 84, hipsMin: 96, hipsMax: 99, waistCm: '81.0–82.5', waistIn: '32.0–32.5', hipsCm: '97.5', hipsIn: '38.5', inseamCm: '81', inseamIn: '32.0', fitNote: 'Optimal Fit' },
                { sizeLabel: '34', usSize: 'US 34W x 32L', euSize: 'EU 50', ukSize: 'UK 34R', waistMin: 85, waistMax: 89, hipsMin: 101, hipsMax: 104, waistCm: '86.0–87.5', waistIn: '34.0–34.5', hipsCm: '102.5', hipsIn: '40.5', inseamCm: '81', inseamIn: '32.0', fitNote: 'Classic 501' },
                { sizeLabel: '36', usSize: 'US 36W x 32L', euSize: 'EU 52', ukSize: 'UK 36R', waistMin: 90, waistMax: 95, hipsMin: 106, hipsMax: 109, waistCm: '91.0–92.5', waistIn: '36.0–36.5', hipsCm: '107.5', hipsIn: '42.5', inseamCm: '81', inseamIn: '32.0', fitNote: 'Roomy Thigh' },
              ],
              women: [
                { sizeLabel: '25', usSize: 'US 0–2 (25W)', euSize: 'EU 32', ukSize: 'UK 4', waistMin: 62, waistMax: 65, hipsMin: 86, hipsMax: 90, waistCm: '63.5', waistIn: '25.0', hipsCm: '89.0', hipsIn: '35.0', inseamCm: '76', inseamIn: '30.0', fitNote: 'High Rise' },
                { sizeLabel: '27', usSize: 'US 4 (27W)', euSize: 'EU 34–36', ukSize: 'UK 6–8', waistMin: 67, waistMax: 70, hipsMin: 91, hipsMax: 95, waistCm: '68.5', waistIn: '27.0', hipsCm: '94.0', hipsIn: '37.0', inseamCm: '76', inseamIn: '30.0', fitNote: 'Straight Fit' },
                { sizeLabel: '29', usSize: 'US 8 (29W)', euSize: 'EU 38–40', ukSize: 'UK 10–12', waistMin: 72, waistMax: 76, hipsMin: 96, hipsMax: 100, waistCm: '73.5', waistIn: '29.0', hipsCm: '99.0', hipsIn: '39.0', inseamCm: '76', inseamIn: '30.0', fitNote: 'Natural Waist' },
                { sizeLabel: '31', usSize: 'US 12 (31W)', euSize: 'EU 42', ukSize: 'UK 14', waistMin: 78, waistMax: 83, hipsMin: 102, hipsMax: 107, waistCm: '78.5', waistIn: '31.0', hipsCm: '104.0', hipsIn: '41.0', inseamCm: '76', inseamIn: '30.0', fitNote: 'Comfort Denim' },
              ],
            },
          },
        ],
      },
      {
        key: 'outerwear',
        label: 'Outerwear',
        subcategories: [
          {
            id: 'levis-outerwear-trucker',
            name: 'Denim Trucker Jackets',
            fitType: 'True to Size',
            fitDescription: 'Straight silhouette that hits at the hip with buttoned flap pockets.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36–38)', euSize: 'EU 46–48', ukSize: 'UK 36–38', chestMin: 88, chestMax: 95, chestCm: '88–95', chestIn: '34.5–37.5', lengthCm: '62', lengthIn: '24.5', fitNote: 'Tailored Waist' },
                { sizeLabel: 'M', usSize: 'US M (40)', euSize: 'EU 50', ukSize: 'UK 40', chestMin: 96, chestMax: 103, chestCm: '96–103', chestIn: '37.5–40.5', lengthCm: '64', lengthIn: '25.2', fitNote: 'Authentic Fit' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 104, chestMax: 111, chestCm: '104–111', chestIn: '41.0–43.5', lengthCm: '66', lengthIn: '26.0', fitNote: 'Layering Room' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 4. ZARA
  // =========================================================================
  {
    id: 'zara',
    name: 'Zara',
    type: 'global',
    logoInitials: 'ZR',
    accentColor: 'from-zinc-800 to-black',
    confidence: 97.5,
    skuCount: 12,
    sourceNote: 'Verified Brand Catalog (Zara.com/sizing)',
    fitPhilosophy: 'European contemporary slim styling. Designed for sleek drape with tailored shoulder seams.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'zara-tops-shirts',
            name: 'Shirts & Knitwear',
            fitType: 'Athletic / Slim',
            fitDescription: 'Modern European cut with trimmer sleeve circumference.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36)', euSize: 'EU 38', ukSize: 'UK 36', chestMin: 89, chestMax: 94, waistMin: 76, waistMax: 80, chestCm: '90–94', chestIn: '35.5–37.0', waistCm: '76–80', waistIn: '30.0–31.5', fitNote: 'Slim Profile' },
                { sizeLabel: 'M', usSize: 'US M (38–40)', euSize: 'EU 40', ukSize: 'UK 38–40', chestMin: 95, chestMax: 101, waistMin: 81, waistMax: 86, chestCm: '96–100', chestIn: '37.5–39.5', waistCm: '82–86', waistIn: '32.0–34.0', fitNote: 'Modern Fit' },
                { sizeLabel: 'L', usSize: 'US L (42)', euSize: 'EU 42', ukSize: 'UK 42', chestMin: 102, chestMax: 107, waistMin: 87, waistMax: 92, chestCm: '102–106', chestIn: '40.0–42.0', waistCm: '88–92', waistIn: '34.5–36.0', fitNote: 'Relaxed Tailoring' },
                { sizeLabel: 'XL', usSize: 'US XL (44)', euSize: 'EU 44', ukSize: 'UK 44', chestMin: 108, chestMax: 114, waistMin: 93, waistMax: 99, chestCm: '108–114', chestIn: '42.5–45.0', waistCm: '94–100', waistIn: '37.0–39.5', fitNote: 'Comfortable Drape' },
              ],
              women: [
                { sizeLabel: 'XS', usSize: 'US 2 (XS)', euSize: 'EU 34', ukSize: 'UK 6', chestMin: 80, chestMax: 84, waistMin: 62, waistMax: 66, chestCm: '80–84', chestIn: '31.5–33.0', waistCm: '62–66', waistIn: '24.5–26.0', fitNote: 'Fitted' },
                { sizeLabel: 'S', usSize: 'US 4 (S)', euSize: 'EU 36', ukSize: 'UK 8', chestMin: 84, chestMax: 88, waistMin: 66, waistMax: 70, chestCm: '84–88', chestIn: '33.0–34.5', waistCm: '66–70', waistIn: '26.0–27.5', fitNote: 'Tailored' },
                { sizeLabel: 'M', usSize: 'US 6–8 (M)', euSize: 'EU 38', ukSize: 'UK 10', chestMin: 88, chestMax: 94, waistMin: 70, waistMax: 76, chestCm: '88–94', chestIn: '34.5–37.0', waistCm: '70–76', waistIn: '27.5–30.0', fitNote: 'Fluid Cut' },
                { sizeLabel: 'L', usSize: 'US 10 (L)', euSize: 'EU 40', ukSize: 'UK 12', chestMin: 94, chestMax: 100, waistMin: 76, waistMax: 82, chestCm: '94–100', chestIn: '37.0–39.5', waistCm: '76–82', waistIn: '30.0–32.5', fitNote: 'Generous Drape' },
              ],
            },
          },
        ],
      },
      {
        key: 'dresses',
        label: 'Dresses',
        subcategories: [
          {
            id: 'zara-dresses-midi',
            name: 'Midi & Evening Dresses',
            fitType: 'True to Size',
            fitDescription: 'Flowing drape with precise waist darts and invisible back zip closure.',
            rowsByPersona: {
              women: [
                { sizeLabel: 'XS', usSize: 'US 2 (XS)', euSize: 'EU 34', ukSize: 'UK 6', chestMin: 80, chestMax: 84, waistMin: 62, waistMax: 66, hipsMin: 88, hipsMax: 92, chestCm: '80–84', waistCm: '62–66', hipsCm: '88–92', lengthCm: '115', fitNote: 'Fitted Bust' },
                { sizeLabel: 'S', usSize: 'US 4 (S)', euSize: 'EU 36', ukSize: 'UK 8', chestMin: 84, chestMax: 88, waistMin: 66, waistMax: 70, hipsMin: 92, hipsMax: 96, chestCm: '84–88', waistCm: '66–70', hipsCm: '92–96', lengthCm: '117', fitNote: 'Natural Waist' },
                { sizeLabel: 'M', usSize: 'US 6–8 (M)', euSize: 'EU 38', ukSize: 'UK 10', chestMin: 88, chestMax: 94, waistMin: 70, waistMax: 76, hipsMin: 96, hipsMax: 102, chestCm: '88–94', waistCm: '70–76', hipsCm: '96–102', lengthCm: '119', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US 10 (L)', euSize: 'EU 40', ukSize: 'UK 12', chestMin: 94, chestMax: 102, waistMin: 76, waistMax: 84, hipsMin: 102, hipsMax: 110, chestCm: '94–102', waistCm: '76–84', hipsCm: '102–110', lengthCm: '121', fitNote: 'A-Line Swing' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 5. CARHARTT WIP
  // =========================================================================
  {
    id: 'carhartt-wip',
    name: 'Carhartt WIP',
    type: 'global',
    logoInitials: 'CW',
    accentColor: 'from-amber-700 to-yellow-800',
    confidence: 96.2,
    skuCount: 8,
    sourceNote: 'Carhartt-wip.com specs',
    fitPhilosophy: 'Durable heritage workwear. Cuts are deliberately relaxed with roomy chest measurements for physical movement.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'carhartt-tops-tees',
            name: 'Heavyweight Pocket Tees',
            fitType: 'Relaxed / Oversized',
            fitDescription: 'Cut from 230 GSM organic cotton with boxy torso and dropped shoulders.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36–38)', euSize: 'EU 46–48', ukSize: 'UK 36–38', chestMin: 91, chestMax: 97, chestCm: '91–97', chestIn: '36.0–38.0', lengthCm: '71', lengthIn: '28.0', fitNote: 'Boxy Fit' },
                { sizeLabel: 'M', usSize: 'US M (40)', euSize: 'EU 50', ukSize: 'UK 40', chestMin: 98, chestMax: 105, chestCm: '99–105', chestIn: '39.0–41.5', lengthCm: '73', lengthIn: '28.7', fitNote: 'Signature Relaxed' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 106, chestMax: 113, chestCm: '107–113', chestIn: '42.0–44.5', lengthCm: '75', lengthIn: '29.5', fitNote: 'Roomy Workwear' },
                { sizeLabel: 'XL', usSize: 'US XL (46)', euSize: 'EU 56', ukSize: 'UK 46', chestMin: 114, chestMax: 122, chestCm: '114–122', chestIn: '45.0–48.0', lengthCm: '77', lengthIn: '30.3', fitNote: 'Oversized' },
              ],
            },
          },
        ],
      },
      {
        key: 'outerwear',
        label: 'Outerwear',
        subcategories: [
          {
            id: 'carhartt-outerwear-detroit',
            name: 'Detroit Canvas Work Jackets',
            fitType: 'Relaxed / Oversized',
            fitDescription: '12oz Dearborn canvas jacket with blanket lining and corduroy collar.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36–38)', euSize: 'EU 46–48', ukSize: 'UK 36–38', chestMin: 92, chestMax: 98, chestCm: '94–100', chestIn: '37.0–39.5', lengthCm: '67', lengthIn: '26.4', fitNote: 'Layering Allowance' },
                { sizeLabel: 'M', usSize: 'US M (40)', euSize: 'EU 50', ukSize: 'UK 40', chestMin: 99, chestMax: 106, chestCm: '102–108', chestIn: '40.0–42.5', lengthCm: '69', lengthIn: '27.2', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 107, chestMax: 115, chestCm: '110–116', chestIn: '43.5–45.5', lengthCm: '71', lengthIn: '28.0', fitNote: 'Generous Work Fit' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 6. PUMA
  // =========================================================================
  {
    id: 'puma',
    name: 'Puma',
    type: 'global',
    logoInitials: 'PM',
    accentColor: 'from-emerald-600 to-teal-700',
    confidence: 97.9,
    skuCount: 6,
    sourceNote: 'Puma.com fit repository',
    fitPhilosophy: 'Athletic speed silhouette with snug heel lockdown and responsive forefoot flex.',
    categories: [
      {
        key: 'footwear',
        label: 'Footwear',
        subcategories: [
          {
            id: 'puma-shoes-trainers',
            name: 'Training Shoes & Retro Suede',
            fitType: 'True to Size',
            fitDescription: 'Low-profile rubber cupsole with padded tongue and formstrip bracing.',
            rowsByPersona: {
              men: [
                { sizeLabel: '8.0', usSize: 'US 8.0', euSize: 'EU 40.5', ukSize: 'UK 7.0', footLengthMin: 25.5, footLengthMax: 26.2, footLengthCm: '26.0', footLengthIn: '10.2', fitNote: 'Medium Width' },
                { sizeLabel: '9.0', usSize: 'US 9.0', euSize: 'EU 42.0', ukSize: 'UK 8.0', footLengthMin: 26.5, footLengthMax: 27.2, footLengthCm: '27.0', footLengthIn: '10.6', fitNote: 'Medium Width' },
                { sizeLabel: '10.0', usSize: 'US 10.0', euSize: 'EU 43.0', ukSize: 'UK 9.0', footLengthMin: 27.5, footLengthMax: 28.2, footLengthCm: '28.0', footLengthIn: '11.0', fitNote: 'Medium Width' },
                { sizeLabel: '11.0', usSize: 'US 11.0', euSize: 'EU 44.5', ukSize: 'UK 10.0', footLengthMin: 28.5, footLengthMax: 29.2, footLengthCm: '29.0', footLengthIn: '11.4', fitNote: 'Medium Width' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 7. NEW BALANCE
  // =========================================================================
  {
    id: 'new-balance',
    name: 'New Balance',
    type: 'global',
    logoInitials: 'NB',
    accentColor: 'from-slate-700 to-slate-900',
    confidence: 98.5,
    skuCount: 15,
    sourceNote: 'NewBalance.com standard sizing grid',
    fitPhilosophy: 'Famous for ergonomic toe boxes and multiple width offerings (D, 2E, 4E).',
    categories: [
      {
        key: 'footwear',
        label: 'Footwear',
        subcategories: [
          {
            id: 'nb-footwear-heritage',
            name: 'Heritage Lifestyle Runners (550 / 990 / 574)',
            fitType: 'True to Size',
            fitDescription: 'ENCAP midsole with plush pigskin suede panels and structured arch support.',
            rowsByPersona: {
              men: [
                { sizeLabel: '8.5', usSize: 'US 8.5', euSize: 'EU 42.0', ukSize: 'UK 8.0', footLengthMin: 26.1, footLengthMax: 26.6, footLengthCm: '26.5', footLengthIn: '10.4', fitNote: 'D - Standard' },
                { sizeLabel: '9.0', usSize: 'US 9.0', euSize: 'EU 42.5', ukSize: 'UK 8.5', footLengthMin: 26.7, footLengthMax: 27.1, footLengthCm: '27.0', footLengthIn: '10.6', fitNote: 'D - Standard' },
                { sizeLabel: '9.5', usSize: 'US 9.5', euSize: 'EU 43.0', ukSize: 'UK 9.0', footLengthMin: 27.2, footLengthMax: 27.6, footLengthCm: '27.5', footLengthIn: '10.8', fitNote: 'D - Standard' },
                { sizeLabel: '10.0', usSize: 'US 10.0', euSize: 'EU 44.0', ukSize: 'UK 9.5', footLengthMin: 27.7, footLengthMax: 28.1, footLengthCm: '28.0', footLengthIn: '11.0', fitNote: 'D - Standard' },
                { sizeLabel: '10.5', usSize: 'US 10.5', euSize: 'EU 44.5', ukSize: 'UK 10.0', footLengthMin: 28.2, footLengthMax: 28.6, footLengthCm: '28.5', footLengthIn: '11.2', fitNote: 'D - Standard' },
                { sizeLabel: '11.0', usSize: 'US 11.0', euSize: 'EU 45.0', ukSize: 'UK 10.5', footLengthMin: 28.7, footLengthMax: 29.1, footLengthCm: '29.0', footLengthIn: '11.4', fitNote: 'D - Standard' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 8. MOUSTACHE STORE (Private Label)
  // =========================================================================
  {
    id: 'moustache-store',
    name: 'Moustache Store',
    type: 'private',
    logoInitials: 'MS',
    accentColor: 'from-amber-600 to-stone-800',
    confidence: 98.0,
    skuCount: 16,
    sourceNote: 'Merchant In-House Pattern Master Specs',
    fitPhilosophy: 'Premium menswear private label. Tailored drape with artisanal proportions.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'ms-tops-heavy',
            name: 'Heavyweight Boxy Tees',
            fitType: 'Relaxed / Oversized',
            fitDescription: '280 GSM combed jersey with custom dropped shoulders and twin-needle hems.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36–38)', euSize: 'EU 46–48', ukSize: 'UK 36–38', chestMin: 92, chestMax: 98, chestCm: '96–100', chestIn: '37.8–39.4', lengthCm: '70', lengthIn: '27.5', fitNote: 'Tailored Boxy' },
                { sizeLabel: 'M', usSize: 'US M (40)', euSize: 'EU 50', ukSize: 'UK 40', chestMin: 99, chestMax: 106, chestCm: '102–106', chestIn: '40.2–41.7', lengthCm: '72', lengthIn: '28.3', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 107, chestMax: 114, chestCm: '108–114', chestIn: '42.5–44.8', lengthCm: '74', lengthIn: '29.1', fitNote: 'Relaxed Streetwear' },
                { sizeLabel: 'XL', usSize: 'US XL (46)', euSize: 'EU 56', ukSize: 'UK 46', chestMin: 115, chestMax: 124, chestCm: '116–122', chestIn: '45.6–48.0', lengthCm: '76', lengthIn: '29.9', fitNote: 'Generous Cut' },
              ],
            },
          },
        ],
      },
      {
        key: 'footwear',
        label: 'Footwear',
        subcategories: [
          {
            id: 'ms-shoes-leather',
            name: 'Retro Leather Low-Tops',
            fitType: 'True to Size',
            fitDescription: 'Calfskin leather with cushioned memory foam footbed and vulcanized cupsole.',
            rowsByPersona: {
              men: [
                { sizeLabel: '8.0', usSize: 'US 8.0', euSize: 'EU 41.0', ukSize: 'UK 7.0', footLengthMin: 25.6, footLengthMax: 26.2, footLengthCm: '26.0', footLengthIn: '10.2', fitNote: 'Standard Width' },
                { sizeLabel: '9.0', usSize: 'US 9.0', euSize: 'EU 42.5', ukSize: 'UK 8.0', footLengthMin: 26.6, footLengthMax: 27.2, footLengthCm: '27.0', footLengthIn: '10.6', fitNote: 'Standard Width' },
                { sizeLabel: '10.0', usSize: 'US 10.0', euSize: 'EU 44.0', ukSize: 'UK 9.0', footLengthMin: 27.6, footLengthMax: 28.2, footLengthCm: '28.0', footLengthIn: '11.0', fitNote: 'Standard Width' },
                { sizeLabel: '11.0', usSize: 'US 11.0', euSize: 'EU 45.0', ukSize: 'UK 10.0', footLengthMin: 28.6, footLengthMax: 29.2, footLengthCm: '29.0', footLengthIn: '11.4', fitNote: 'Standard Width' },
              ],
            },
          },
        ],
      },
      {
        key: 'outerwear',
        label: 'Outerwear',
        subcategories: [
          {
            id: 'ms-outerwear-blazers',
            name: 'Wool Blend Slim Blazers',
            fitType: 'Athletic / Slim',
            fitDescription: 'Structured lightweight wool-blend jacket with dual rear vents and horn buttons.',
            rowsByPersona: {
              men: [
                { sizeLabel: '38R', usSize: 'US 38R', euSize: 'EU 48', ukSize: 'UK 38R', chestMin: 94, chestMax: 99, waistMin: 82, waistMax: 87, chestCm: '98', chestIn: '38.5', waistCm: '88', lengthCm: '73', fitNote: 'Slim Drop 6' },
                { sizeLabel: '40R', usSize: 'US 40R', euSize: 'EU 50', ukSize: 'UK 40R', chestMin: 100, chestMax: 105, waistMin: 88, waistMax: 93, chestCm: '103', chestIn: '40.5', waistCm: '93', lengthCm: '74.5', fitNote: 'Optimal Tailored' },
                { sizeLabel: '42R', usSize: 'US 42R', euSize: 'EU 52', ukSize: 'UK 42R', chestMin: 106, chestMax: 111, waistMin: 94, waistMax: 99, chestCm: '108', chestIn: '42.5', waistCm: '98', lengthCm: '76', fitNote: 'Classic Regular' },
                { sizeLabel: '44R', usSize: 'US 44R', euSize: 'EU 54', ukSize: 'UK 44R', chestMin: 112, chestMax: 118, waistMin: 100, waistMax: 106, chestCm: '114', chestIn: '44.8', waistCm: '104', lengthCm: '77.5', fitNote: 'Generous Proportions' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 9. URBAN BASICS CO (Private Label)
  // =========================================================================
  {
    id: 'urban-basics',
    name: 'Urban Basics Co',
    type: 'private',
    logoInitials: 'UB',
    accentColor: 'from-teal-600 to-cyan-700',
    confidence: 96.5,
    skuCount: 12,
    sourceNote: 'Verified Pattern Catalog',
    fitPhilosophy: 'Clean everyday wardrobe staples prioritizing soft drape and modern boxy fits.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'ub-tops-relaxed',
            name: 'Heavy Relaxed Pocket Tees',
            fitType: 'Relaxed / Oversized',
            fitDescription: 'Pre-shrunk cotton tee with dropped shoulder line.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36)', euSize: 'EU 46', ukSize: 'UK 36', chestMin: 88, chestMax: 94, chestCm: '88–94', chestIn: '34.5–37.0', lengthCm: '69', lengthIn: '27.2', fitNote: 'Clean Relaxed' },
                { sizeLabel: 'M', usSize: 'US M (38–40)', euSize: 'EU 48–50', ukSize: 'UK 38–40', chestMin: 95, chestMax: 102, chestCm: '95–102', chestIn: '37.5–40.0', lengthCm: '71', lengthIn: '28.0', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US L (42)', euSize: 'EU 52', ukSize: 'UK 42', chestMin: 103, chestMax: 110, chestCm: '103–110', chestIn: '40.5–43.3', lengthCm: '73', lengthIn: '28.7', fitNote: 'Roomy Comfort' },
                { sizeLabel: 'XL', usSize: 'US XL (44–46)', euSize: 'EU 54–56', ukSize: 'UK 44–46', chestMin: 111, chestMax: 118, chestCm: '111–118', chestIn: '43.7–46.5', lengthCm: '75', lengthIn: '29.5', fitNote: 'Boxy Drape' },
              ],
            },
          },
        ],
      },
      {
        key: 'dresses',
        label: 'Dresses',
        subcategories: [
          {
            id: 'ub-dresses-midi',
            name: 'Ribbed Modal Midi Tank Dresses',
            fitType: 'Athletic / Slim',
            fitDescription: 'Stretchy ribbed modal with scooped neckline and side slit.',
            rowsByPersona: {
              women: [
                { sizeLabel: 'XS', usSize: 'US 0–2 (XS)', euSize: 'EU 32–34', ukSize: 'UK 4–6', chestMin: 78, chestMax: 83, waistMin: 60, waistMax: 65, hipsMin: 86, hipsMax: 91, chestCm: '78–83', waistCm: '60–65', hipsCm: '86–91', lengthCm: '112', fitNote: 'Bodycon Stretch' },
                { sizeLabel: 'S', usSize: 'US 4–6 (S)', euSize: 'EU 36–38', ukSize: 'UK 8–10', chestMin: 84, chestMax: 89, waistMin: 66, waistMax: 71, hipsMin: 92, hipsMax: 97, chestCm: '84–89', waistCm: '66–71', hipsCm: '92–97', lengthCm: '114', fitNote: 'Curve Hugging' },
                { sizeLabel: 'M', usSize: 'US 8–10 (M)', euSize: 'EU 40–42', ukSize: 'UK 12–14', chestMin: 90, chestMax: 96, waistMin: 72, waistMax: 78, hipsMin: 98, hipsMax: 104, chestCm: '90–96', waistCm: '72–78', hipsCm: '98–104', lengthCm: '116', fitNote: 'Comfort Stretch' },
                { sizeLabel: 'L', usSize: 'US 12–14 (L)', euSize: 'EU 44–46', ukSize: 'UK 16–18', chestMin: 97, chestMax: 104, waistMin: 79, waistMax: 86, hipsMin: 105, hipsMax: 112, chestCm: '97–104', waistCm: '79–86', hipsCm: '105–112', lengthCm: '118', fitNote: 'Easy Fit' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 10. ASOS DESIGN
  // =========================================================================
  {
    id: 'asos-design',
    name: 'ASOS Design',
    type: 'private',
    logoInitials: 'AS',
    accentColor: 'from-pink-600 to-rose-600',
    confidence: 96.0,
    skuCount: 8,
    sourceNote: 'ASOS Verified Fit Matrix',
    fitPhilosophy: 'London fashion forward sizing with dedicated tall, petite, and hourglass variations.',
    categories: [
      {
        key: 'bottoms',
        label: 'Bottoms',
        subcategories: [
          {
            id: 'asos-bottoms-trousers',
            name: 'Wide Leg Pleated High-Waist Trousers',
            fitType: 'True to Size',
            fitDescription: 'Tailored twill with high rise waistband and deep forward front pleats.',
            rowsByPersona: {
              women: [
                { sizeLabel: 'UK 6', usSize: 'US 2 (UK 6)', euSize: 'EU 34', ukSize: 'UK 6', waistMin: 61, waistMax: 64, hipsMin: 85, hipsMax: 88, waistCm: '62.5', waistIn: '24.5', hipsCm: '86.5', hipsIn: '34.0', inseamCm: '79', inseamIn: '31.0', fitNote: 'Fitted Waist' },
                { sizeLabel: 'UK 8', usSize: 'US 4 (UK 8)', euSize: 'EU 36', ukSize: 'UK 8', waistMin: 64, waistMax: 68, hipsMin: 88, hipsMax: 92, waistCm: '65.0', waistIn: '25.5', hipsCm: '89.0', hipsIn: '35.0', inseamCm: '79', inseamIn: '31.0', fitNote: 'Optimal Match' },
                { sizeLabel: 'UK 10', usSize: 'US 6 (UK 10)', euSize: 'EU 38', ukSize: 'UK 10', waistMin: 69, waistMax: 73, hipsMin: 93, hipsMax: 97, waistCm: '70.0', waistIn: '27.5', hipsCm: '94.0', hipsIn: '37.0', inseamCm: '80', inseamIn: '31.5', fitNote: 'Relaxed Wide Leg' },
                { sizeLabel: 'UK 12', usSize: 'US 8 (UK 12)', euSize: 'EU 40', ukSize: 'UK 12', waistMin: 74, waistMax: 78, hipsMin: 98, hipsMax: 102, waistCm: '75.0', waistIn: '29.5', hipsCm: '99.0', hipsIn: '39.0', inseamCm: '80', inseamIn: '31.5', fitNote: 'High Waist Drape' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 11. UNDER ARMOUR
  // =========================================================================
  {
    id: 'under-armour',
    name: 'Under Armour',
    type: 'global',
    logoInitials: 'UA',
    accentColor: 'from-slate-800 to-slate-950',
    confidence: 97.2,
    skuCount: 11,
    sourceNote: 'Under Armour Performance Matrix',
    fitPhilosophy: 'Engineered compression and athletic stretch fabrics. Close-to-body second-skin sensation.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'ua-tops-compression',
            name: 'HeatGear Compression & Training Tops',
            fitType: 'Athletic / Slim',
            fitDescription: 'Ultra-tight, second-skin compression fit with 4-way stretch fabric.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (34–36)', euSize: 'EU 46', ukSize: 'UK 34–36', chestMin: 86, chestMax: 94, waistMin: 72, waistMax: 79, chestCm: '86–94', chestIn: '34.0–37.0', waistCm: '72–79', waistIn: '28.5–31.0', fitNote: 'Athletic Compression' },
                { sizeLabel: 'M', usSize: 'US M (38–40)', euSize: 'EU 48–50', ukSize: 'UK 38–40', chestMin: 95, chestMax: 102, waistMin: 80, waistMax: 86, chestCm: '95–102', chestIn: '37.5–40.0', waistCm: '80–86', waistIn: '31.5–34.0', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 103, chestMax: 112, waistMin: 87, waistMax: 94, chestCm: '103–112', chestIn: '40.5–44.0', waistCm: '87–94', waistIn: '34.5–37.0', fitNote: 'Performance Fit' },
                { sizeLabel: 'XL', usSize: 'US XL (46)', euSize: 'EU 56', ukSize: 'UK 46', chestMin: 113, chestMax: 122, waistMin: 95, waistMax: 104, chestCm: '113–122', chestIn: '44.5–48.0', waistCm: '95–104', waistIn: '37.5–41.0', fitNote: 'Muscle Fit' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 12. CHAMPION
  // =========================================================================
  {
    id: 'champion',
    name: 'Champion',
    type: 'global',
    logoInitials: 'CP',
    accentColor: 'from-blue-700 to-red-600',
    confidence: 96.8,
    skuCount: 7,
    sourceNote: 'Champion Heritage Catalog',
    fitPhilosophy: 'Heavyweight cross-grain fleece constructed to resist vertical shrinkage.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'champion-tops-reverse-weave',
            name: 'Reverse Weave Hoodies & Sweats',
            fitType: 'Relaxed / Oversized',
            fitDescription: 'Signature 12oz fleece cut on the cross-grain with ribbed side stretch gussets.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (34–36)', euSize: 'EU 46', ukSize: 'UK 34–36', chestMin: 89, chestMax: 95, chestCm: '90–95', chestIn: '35.5–37.5', lengthCm: '68', lengthIn: '26.8', fitNote: 'Authentic Heritage' },
                { sizeLabel: 'M', usSize: 'US M (38–40)', euSize: 'EU 48–50', ukSize: 'UK 38–40', chestMin: 96, chestMax: 104, chestCm: '97–104', chestIn: '38.0–41.0', lengthCm: '71', lengthIn: '28.0', fitNote: 'Optimal Match' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 105, chestMax: 112, chestCm: '106–112', chestIn: '41.5–44.0', lengthCm: '73', lengthIn: '28.7', fitNote: 'Relaxed Fleece' },
                { sizeLabel: 'XL', usSize: 'US XL (46–48)', euSize: 'EU 56–58', ukSize: 'UK 46–48', chestMin: 113, chestMax: 122, chestCm: '114–122', chestIn: '45.0–48.0', lengthCm: '76', lengthIn: '30.0', fitNote: 'Heavy Comfort' },
              ],
            },
          },
        ],
      },
    ],
  },

  // =========================================================================
  // 13. STÜSSY
  // =========================================================================
  {
    id: 'stussy',
    name: 'Stüssy',
    type: 'global',
    logoInitials: 'ST',
    accentColor: 'from-neutral-900 to-stone-900',
    confidence: 97.0,
    skuCount: 9,
    sourceNote: 'Stüssy Streetwear Spec Sheet',
    fitPhilosophy: 'Classic Southern California skate and streetwear relaxed silhouette with wider necklines and boxy trunks.',
    categories: [
      {
        key: 'tops',
        label: 'Tops',
        subcategories: [
          {
            id: 'stussy-tops-tees',
            name: 'Basic Logo Tees & Graphic Sweats',
            fitType: 'Relaxed / Oversized',
            fitDescription: 'Pigment dyed jersey with wide chest tolerance and relaxed ribbed hem.',
            rowsByPersona: {
              men: [
                { sizeLabel: 'S', usSize: 'US S (36–38)', euSize: 'EU 46–48', ukSize: 'UK 36–38', chestMin: 92, chestMax: 98, chestCm: '94–98', chestIn: '37.0–38.5', lengthCm: '70', lengthIn: '27.5', fitNote: 'Skate Boxy' },
                { sizeLabel: 'M', usSize: 'US M (40)', euSize: 'EU 50', ukSize: 'UK 40', chestMin: 99, chestMax: 106, chestCm: '100–106', chestIn: '39.5–41.7', lengthCm: '72', lengthIn: '28.3', fitNote: 'Optimal Street' },
                { sizeLabel: 'L', usSize: 'US L (42–44)', euSize: 'EU 52–54', ukSize: 'UK 42–44', chestMin: 107, chestMax: 115, chestCm: '108–115', chestIn: '42.5–45.2', lengthCm: '74', lengthIn: '29.1', fitNote: 'Relaxed Oversized' },
                { sizeLabel: 'XL', usSize: 'US XL (46)', euSize: 'EU 56', ukSize: 'UK 46', chestMin: 116, chestMax: 125, chestCm: '117–125', chestIn: '46.0–49.2', lengthCm: '76', lengthIn: '30.0', fitNote: 'Baggy Cut' },
              ],
            },
          },
        ],
      },
    ],
  },
];
