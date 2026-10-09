import type { Audience } from "@/lib/sizing/keys";
import type { Measurement, SizingGroup } from "@/lib/sizing/measurements";
import { rowsFromColumns, type SeedBound, type SeedChart } from "../types";

const BRAND = "tom_tailor";
const SOURCE_URL = "https://www.tom-tailor.eu/en/size-guides";
const VERIFIED = { verifiedAt: "2026-10-01", status: "verified" as const, locale: "en-EU" };

type Scope = { group: SizingGroup; variant: string; leaves: string[] };

function sourceCharts(input: {
  sourceTableId: string;
  title: string;
  audience: Audience;
  sizes: readonly string[];
  aliases?: Parameters<typeof rowsFromColumns>[0]["aliases"];
  bounds: Partial<Record<Measurement, readonly SeedBound[]>>;
  scopes: Scope[];
  applicability?: SeedChart["applicability"];
}): SeedChart[] {
  const rows = rowsFromColumns({
    sizes: input.sizes,
    aliases: input.aliases,
    bounds: input.bounds,
  });
  const decidingMeasurements = Object.keys(input.bounds) as Measurement[];
  return input.scopes.map((scope) => ({
    brandKey: BRAND,
    sourceTableId: input.sourceTableId,
    sizingCategory: scope.group,
    variantName: scope.variant,
    coversLeaves: scope.leaves,
    audience: input.audience,
    sourceTitle: input.title,
    sourceUrl: SOURCE_URL,
    applicability: input.applicability,
    decidingMeasurements,
    sourceVerification: VERIFIED,
    chartRows: rows,
  }));
}

const WOMEN_DENIM_SIZES = ["XXS/32", "XS/34", "S/36", "M/38", "L/40", "XL/42", "XXL/44"] as const;
const WOMEN_DENIM_CHEST = [[76,79],[80,83],[84,87],[88,91],[92,95],[96,99],[100,104]] as const;
const WOMEN_DENIM_WAIST = [[57,60],[61,64],[65,68],[69,72],[73,76],[77,80],[81,85]] as const;
const WOMEN_DENIM_HIP = [[84,87],[88,91],[92,95],[96,99],[100,103],[104,107],[108,112]] as const;

const DENIM_WOMEN = [
  ...sourceCharts({
    sourceTableId: "denim-female-tops",
    title: "Denim Female: T-Shirts, Polos, Knit & Sweats",
    audience: "womens",
    sizes: WOMEN_DENIM_SIZES,
    aliases: {
      alpha: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
      eu: ["32", "34", "36", "38", "40", "42", "44"],
    },
    bounds: { chest: WOMEN_DENIM_CHEST, waist: WOMEN_DENIM_WAIST },
    applicability: { productLine: "Denim Female", market: "EU" },
    scopes: [{
      group: "tops",
      variant: "Denim Female Tops",
      leaves: ["women:top:t-shirt", "women:top:knit", "women:top:sweater", "women:top:hoodie", "women:top:sweatshirt"],
    }],
  }),
  ...sourceCharts({
    sourceTableId: "denim-female-blouses-blazers-dresses",
    title: "Denim Female: Blouses, Blazers & Dresses",
    audience: "womens",
    sizes: WOMEN_DENIM_SIZES,
    aliases: {
      alpha: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
      eu: ["32", "34", "36", "38", "40", "42", "44"],
    },
    bounds: { chest: WOMEN_DENIM_CHEST, waist: WOMEN_DENIM_WAIST, hip: WOMEN_DENIM_HIP },
    applicability: { productLine: "Denim Female", market: "EU" },
    scopes: [
      { group: "tops", variant: "Denim Female Blouses", leaves: ["women:top:blouse", "women:top:shirt"] },
      { group: "outerwear", variant: "Denim Female Blazers", leaves: ["women:outerwear:blazer"] },
      { group: "dresses", variant: "Denim Female Dresses", leaves: ["women:full-body:dress"] },
    ],
  }),
  ...sourceCharts({
    sourceTableId: "denim-female-trousers",
    title: "Denim Female: Trousers",
    audience: "womens",
    sizes: WOMEN_DENIM_SIZES,
    aliases: { alpha: ["XXS", "XS", "S", "M", "L", "XL", "XXL"], eu: ["32", "34", "36", "38", "40", "42", "44"] },
    bounds: { waist: WOMEN_DENIM_WAIST, hip: WOMEN_DENIM_HIP },
    applicability: { productLine: "Denim Female", market: "EU" },
    scopes: [{ group: "bottoms", variant: "Denim Female Trousers", leaves: ["women:bottom:trouser", "women:bottom:short", "women:bottom:jean"] }],
  }),
  ...sourceCharts({
    sourceTableId: "denim-female-jeans",
    title: "Denim Female: Jeans",
    audience: "womens",
    sizes: ["24/XXS","25/XXS","26/XS","27/XS/S","28/S","29/M","30/M/L","31/L","32/L/XL","33/XL"],
    aliases: {
      numeric: ["24","25","26","27","28","29","30","31","32","33"],
      alpha: ["XXS","XXS","XS",["XS","S"],"S","M",["M","L"],"L",["L","XL"],"XL"],
    },
    bounds: {
      waist: [[56,58],[59,61],[62,64],[65,67],[68,80],[71,73],[74,76],[77,79],[80,82],[83,85]],
      hip: [[82,84],[85,87],[88,90],[91,93],[94,96],[97,99],[100,102],[103,105],[106,108],[109,111]],
    },
    applicability: { productLine: "Denim Female", market: "EU" },
    scopes: [{ group: "bottoms", variant: "Denim Female Jeans", leaves: ["women:bottom:jean"] }],
  }),
  ...sourceCharts({
    sourceTableId: "denim-female-skirts",
    title: "Denim Female: Skirts",
    audience: "womens",
    sizes: WOMEN_DENIM_SIZES,
    aliases: { alpha: ["XXS", "XS", "S", "M", "L", "XL", "XXL"], eu: ["32", "34", "36", "38", "40", "42", "44"] },
    bounds: { waist: WOMEN_DENIM_WAIST, hip: WOMEN_DENIM_HIP },
    applicability: { productLine: "Denim Female", market: "EU" },
    scopes: [{ group: "bottoms", variant: "Denim Female Skirts", leaves: ["women:bottom:skirt"] }],
  }),
];

const WOMEN_PLUS = sourceCharts({
  sourceTableId: "women-plus",
  title: "Women Plus",
  audience: "womens",
  sizes: ["44","46","48","50","52","54","56"],
  aliases: { eu: ["44","46","48","50","52","54","56"] },
  bounds: {
    chest: [[104,109],[110,115],[116,121],[122,127],[128,134],[135,141],[142,148]],
    waist: [[88,93],[94,99],[100,105],[106,111],[112,118],[119,125],[126,132]],
    hip: [[111,116],[117,122],[123,128],[129,134],[135,141],[142,148],[149,155]],
  },
  applicability: { fitClass: "Plus", market: "EU" },
  scopes: [
    { group: "tops", variant: "Women Plus Tops", leaves: ["women:top:t-shirt","women:top:shirt","women:top:blouse","women:top:knit","women:top:sweater","women:top:hoodie","women:top:sweatshirt"] },
    { group: "bottoms", variant: "Women Plus Bottoms", leaves: ["women:bottom:trouser","women:bottom:jean","women:bottom:skirt","women:bottom:short"] },
    { group: "dresses", variant: "Women Plus Dresses", leaves: ["women:full-body:dress"] },
    { group: "outerwear", variant: "Women Plus Outerwear", leaves: ["women:outerwear:blazer","women:outerwear:jacket","women:outerwear:coat"] },
  ],
});

const MEN_FIT = [
  ...sourceCharts({
    sourceTableId: "men-blazers-long",
    title: "Man Casual and Denim Male: Blazers (long size)",
    audience: "mens",
    sizes: ["90","94","98","102","106","110","114"],
    aliases: { eu: ["90","94","98","102","106","110","114"] },
    bounds: {
      height: [[182,190],[183,191],[184,192],[185,193],[186,194],[187,195],[188,196]],
      chest: [[90,93],[94,97],[98,101],[102,115],[106,119],[110,113],[114,117]],
      waist: [[78,81],[82,85],[86,89],[90,93],[94,97],[98,101],[102,105]],
      hip: [[94,97],[98,101],[102,105],[106,109],[110,113],[114,117],[118,121]],
    },
    applicability: { fitClass: "Long", market: "EU" },
    scopes: [{ group: "outerwear", variant: "Men Blazers Long", leaves: ["men:outerwear:blazer"] }],
  }),
  ...sourceCharts({
    sourceTableId: "men-trousers-american",
    title: "Man Casual and Denim Male: Trousers (american size)",
    audience: "mens",
    sizes: ["XXS","XS","S","M","L","XL","XXL","XXXL"],
    aliases: { alpha: ["XXS","XS","S","M","L","XL","XXL","XXXL"] },
    bounds: {
      waist: [[68,71],[72,75],[76,80],[81,86],[87,92],[93,98],[99,104],[105,110]],
      hip: [[84,87],[88,91],[92,96],[97,102],[103,108],[109,114],[115,120],[121,126]],
      inseam: [[78.5,79.5],[79.5,81],[81.5,82.5],[82.5,84],[84.5,85.5],[85.5,87],[87.5,88.5],[88.5,90]],
    },
    applicability: { productLine: "American size", market: "EU" },
    scopes: [{
      group: "bottoms",
      variant: "Men Trousers American",
      leaves: ["men:bottom:trouser","men:bottom:chino","men:bottom:short","men:bottom:swim-short"],
    }],
  }),
  ...sourceCharts({
    sourceTableId: "men-plus-tops",
    title: "Men Plus: Tops",
    audience: "mens",
    sizes: ["2XL","3XL","4XL","5XL"],
    aliases: { alpha: ["2XL","3XL","4XL","5XL"] },
    bounds: {
      chest: [[117,124],[125,132],[133,140],[141,148]],
      waist: [[107,114],[115,122],[123,130],[131,138]],
      hip: [[121,128],[129,136],[137,144],[145,152]],
    },
    applicability: { fitClass: "Plus", market: "EU" },
    scopes: [{ group: "tops", variant: "Men Plus Tops", leaves: ["men:top:t-shirt","men:top:shirt","men:top:polo-shirt","men:top:knit","men:top:sweater","men:top:hoodie","men:top:sweatshirt"] }],
  }),
  ...sourceCharts({
    sourceTableId: "men-plus-trousers-jeans",
    title: "Men Plus: Trousers & Jeans",
    audience: "mens",
    sizes: ["40","42","44","46","48"],
    aliases: { numeric: ["40","42","44","46","48"] },
    bounds: {
      waist: [[109,113],[114,118],[119,123],[124,128],[129,133]],
      hip: [[123,127],[128,132],[133,137],[138,142],[143,147]],
    },
    applicability: { fitClass: "Plus", market: "EU" },
    scopes: [{ group: "bottoms", variant: "Men Plus Trousers & Jeans", leaves: ["men:bottom:trouser","men:bottom:jean"] }],
  }),
];

const GIRL_TEEN_SIZES = ["128","134","140","146","152","158","164","170","176","182"] as const;
const GIRL_TEEN_AGE = ["7-8Y","8-9Y","9-10Y","10-11Y","11-12Y","12-13Y","13-14Y",null,"14+Y",null] as const;
const GIRL_CHEST = [[62.5,65],[65.5,68],[68.5,71],[71.5,74],[74.5,77],[77.5,80],[80.5,83],[83.5,86],[86.5,89],[89.5,92]] as const;
const GIRL_WAIST = [[57.5,58.5],[59,60],[60.5,61.5],[62,63],[63.5,64.5],[65,66],[66.5,67.5],[68,69],[69.5,70.5],[71,72]] as const;
const GIRL_HIP = [[67.5,70],[70.5,73],[73.5,76],[76.5,79.5],[80,83],[83.5,86.5],[87,90],[90.5,93.5],[94,97],[97.5,101.5]] as const;

const GIRLS = [
  ...sourceCharts({
    sourceTableId: "girls-tops", title: "Girls: T-Shirts, Tops, Knit & Sweats", audience: "girls",
    sizes: GIRL_TEEN_SIZES, aliases: { eu: GIRL_TEEN_SIZES, age: GIRL_TEEN_AGE },
    bounds: { chest: GIRL_CHEST, waist: GIRL_WAIST }, applicability: { ageBand: { minMonths: 84, maxMonths: 218, label: "Girls" }, market: "EU" },
    scopes: [{ group: "tops", variant: "Girls Tops", leaves: ["kids-girls:top:t-shirt","kids-girls:top:shirt","kids-girls:top:knit","kids-girls:top:hoodie","kids-girls:top:sweatshirt"] }],
  }),
  ...sourceCharts({
    sourceTableId: "girls-jackets-coats-blouses-blazers-dresses", title: "Girls: Jackets, Coats, Blouses, Blazers & Dresses", audience: "girls",
    sizes: GIRL_TEEN_SIZES, aliases: { eu: GIRL_TEEN_SIZES, age: GIRL_TEEN_AGE },
    bounds: { chest: GIRL_CHEST, waist: GIRL_WAIST, hip: GIRL_HIP }, applicability: { ageBand: { minMonths: 84, maxMonths: 218, label: "Girls" }, market: "EU" },
    scopes: [
      { group: "tops", variant: "Girls Blouses", leaves: ["kids-girls:top:blouse"] },
      { group: "outerwear", variant: "Girls Jackets & Coats", leaves: ["kids-girls:outerwear:jacket","kids-girls:outerwear:coat"] },
      { group: "dresses", variant: "Girls Dresses", leaves: ["kids-girls:full-body:dress"] },
    ],
  }),
  ...sourceCharts({
    sourceTableId: "girls-trousers-jeans", title: "Girls: Trousers & Jeans", audience: "girls",
    sizes: GIRL_TEEN_SIZES, aliases: { eu: GIRL_TEEN_SIZES, age: GIRL_TEEN_AGE },
    bounds: { waist: GIRL_WAIST, hip: GIRL_HIP, inseam: [[57,60.5],[61,64],[64.5,67],[67.5,69],[69.5,72.5],[73,75.5],[76,78.5],[79,81],[81.5,83.5],[84,87]] },
    applicability: { ageBand: { minMonths: 84, maxMonths: 218, label: "Girls" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Girls Trousers & Jeans", leaves: ["kids-girls:bottom:trouser","kids-girls:bottom:jean"] }],
  }),
];

const MINI_GIRL_SIZES = ["92","98","104","110","116","122","128","134"] as const;
const MINI_GIRL_AGE = ["1.5-2Y","2-3Y","3-4Y","4-5Y","5-6Y","6-7Y","7-8Y","8-9Y"] as const;
const MINI_GIRL_CHEST = [[54,54.5],[55,55.5],[56,56.5],[57,57.5],[58,59],[59.5,62],[62.5,65],[65.5,68]] as const;
const MINI_GIRL_WAIST = [[51,51.5],[52,52.5],[53,53.5],[54,54.5],[55,55.5],[56,57],[57.5,58.5],[59,60]] as const;
const MINI_GIRL_HIP = [[54.5,56],[56.5,58],[58.5,60],[60.5,62],[62.5,64],[64.5,67],[67.5,70],[70.5,73]] as const;

const MINI_GIRLS = [
  ...sourceCharts({
    sourceTableId: "mini-girls-woven-dresses-coats", title: "Mini Girls: Woven dresses & Coats", audience: "girls",
    sizes: MINI_GIRL_SIZES, aliases: { eu: MINI_GIRL_SIZES, age: MINI_GIRL_AGE },
    bounds: { chest: MINI_GIRL_CHEST, waist: MINI_GIRL_WAIST, hip: MINI_GIRL_HIP },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Girls" }, market: "EU" },
    scopes: [
      { group: "dresses", variant: "Mini Girls Woven Dresses", leaves: ["kids-girls:full-body:dress"] },
      { group: "outerwear", variant: "Mini Girls Coats", leaves: ["kids-girls:outerwear:coat"] },
    ],
  }),
  ...sourceCharts({
    sourceTableId: "mini-girls-trousers-jeans", title: "Mini Girls: Trousers & Jeans", audience: "girls",
    sizes: MINI_GIRL_SIZES, aliases: { eu: MINI_GIRL_SIZES, age: MINI_GIRL_AGE },
    bounds: { waist: MINI_GIRL_WAIST, hip: MINI_GIRL_HIP, inseam: [[35,38],[38.5,41.5],[42,45],[45.5,48.5],[49,52.5],[53,56.5],[57,60.5],[61,64]] },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Girls" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Mini Girls Trousers & Jeans", leaves: ["kids-girls:bottom:trouser","kids-girls:bottom:jean"] }],
  }),
  ...sourceCharts({
    sourceTableId: "mini-girls-skirts", title: "Mini Girls: Skirts", audience: "girls",
    sizes: MINI_GIRL_SIZES, aliases: { eu: MINI_GIRL_SIZES, age: MINI_GIRL_AGE },
    bounds: { waist: MINI_GIRL_WAIST, hip: MINI_GIRL_HIP },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Girls" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Mini Girls Skirts", leaves: ["kids-girls:bottom:skirt"] }],
  }),
];

const BOY_TEEN_CHEST = [[67.5,69],[69.5,71],[71.5,73],[73.5,75],[75.5,77],[77.5,80.5],[81,83.5],[84,86.5],[87,89.5],[90,92.5]] as const;
const BOY_TEEN_WAIST = [[57.5,59],[59.5,61],[61.5,63],[63.5,65],[65.5,67],[67.5,69],[69.5,71],[71.5,73],[73.5,75],[75.5,78.5]] as const;
const BOY_TEEN_HIP = [[68,70.5],[71,73.5],[74,76.5],[77,79.5],[80,82.5],[83,85.5],[86,88.5],[89,91.5],[92,94.5],[95,97.5]] as const;

const BOYS = [
  ...sourceCharts({
    sourceTableId: "boys-tops", title: "Boys: T-Shirts, Knits & Sweats", audience: "boys",
    sizes: GIRL_TEEN_SIZES, aliases: { eu: GIRL_TEEN_SIZES, age: GIRL_TEEN_AGE },
    bounds: { chest: BOY_TEEN_CHEST, waist: BOY_TEEN_WAIST }, applicability: { ageBand: { minMonths: 84, maxMonths: 218, label: "Boys" }, market: "EU" },
    scopes: [{ group: "tops", variant: "Boys Tops", leaves: ["kids-boys:top:t-shirt","kids-boys:top:knit","kids-boys:top:hoodie","kids-boys:top:sweatshirt"] }],
  }),
  ...sourceCharts({
    sourceTableId: "boys-jackets", title: "Boys: Jackets", audience: "boys",
    sizes: GIRL_TEEN_SIZES, aliases: { eu: GIRL_TEEN_SIZES, age: GIRL_TEEN_AGE },
    bounds: { chest: BOY_TEEN_CHEST, waist: BOY_TEEN_WAIST, hip: BOY_TEEN_HIP }, applicability: { ageBand: { minMonths: 84, maxMonths: 218, label: "Boys" }, market: "EU" },
    scopes: [{ group: "outerwear", variant: "Boys Jackets", leaves: ["kids-boys:outerwear:jacket","kids-boys:outerwear:coat"] }],
  }),
  ...sourceCharts({
    sourceTableId: "boys-trousers-jeans", title: "Boys: Trousers & Jeans", audience: "boys",
    sizes: GIRL_TEEN_SIZES, aliases: { eu: GIRL_TEEN_SIZES, age: GIRL_TEEN_AGE },
    bounds: { waist: BOY_TEEN_WAIST, hip: BOY_TEEN_HIP, inseam: [[58,60.5],[61,63.5],[64,66.5],[67,69.5],[70,72.5],[73,75.5],[76,78.5],[79,81.5],[82,84.5],[85,87.5]] },
    applicability: { ageBand: { minMonths: 84, maxMonths: 218, label: "Boys" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Boys Trousers & Jeans", leaves: ["kids-boys:bottom:trouser","kids-boys:bottom:jean"] }],
  }),
];

const MINI_BOY_CHEST = [[55.5,57],[57.5,59],[59.5,61],[61.5,63],[63.5,65],[65.5,67],[67.5,69],[69.5,71]] as const;
const MINI_BOY_WAIST = [[51.5,52],[52.5,53],[53.5,54],[54.5,55],[55.5,56],[56.5,57],[57.5,59],[59.5,61]] as const;
const MINI_BOY_HIP = [[56.5,58],[58.5,60],[60.5,62],[62.5,64],[64.5,66],[66.5,68],[68.5,70.5],[71,73.5]] as const;

const MINI_BOYS = [
  ...sourceCharts({
    sourceTableId: "mini-boys-coats", title: "Mini Boys: Coats", audience: "boys",
    sizes: MINI_GIRL_SIZES, aliases: { eu: MINI_GIRL_SIZES, age: MINI_GIRL_AGE },
    bounds: { chest: MINI_BOY_CHEST, waist: MINI_BOY_WAIST, hip: MINI_BOY_HIP },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Boys" }, market: "EU" },
    scopes: [{ group: "outerwear", variant: "Mini Boys Coats", leaves: ["kids-boys:outerwear:coat"] }],
  }),
  ...sourceCharts({
    sourceTableId: "mini-boys-trousers-jeans", title: "Mini Boys: Trousers & Jeans", audience: "boys",
    sizes: MINI_GIRL_SIZES, aliases: { eu: MINI_GIRL_SIZES, age: MINI_GIRL_AGE },
    bounds: { waist: MINI_BOY_WAIST, hip: MINI_BOY_HIP, inseam: [[33,36.5],[37,40.5],[41,44.5],[45,48.5],[49,52.5],[53,56.5],[57,60.5],[61,63.5]] },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Boys" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Mini Boys Trousers & Jeans", leaves: ["kids-boys:bottom:trouser","kids-boys:bottom:jean"] }],
  }),
];

const GROUPED_KID_SIZES = ["92/98","104/110","116/122","128/134"] as const;
const GROUPED_KID_AGE = ["1.5-3Y","3-5Y","5-7Y","7-9Y"] as const;

const REMAINING_OFFICIAL_TABLES = [
  ...sourceCharts({
    sourceTableId: "men-trousers-long",
    title: "Man Casual and Denim Male: Trousers (long size)",
    audience: "mens",
    sizes: ["90","94","98","102","106","110","114"],
    aliases: { eu: ["90","94","98","102","106","110","114"] },
    bounds: {
      height: [[182,190],[183,191],[184,192],[185,193],[186,194],[187,195],[188,196]],
      waist: [[78,81],[82,85],[86,89],[90,93],[94,97],[98,101],[102,105]],
      hip: [[94,97],[98,101],[102,105],[106,109],[110,113],[114,117],[118,121]],
      inseam: [[84.5,85],[85.5,86],[86.5,87],[87.5,88],[88.5,89],[89.5,90],[90.5,91]],
    },
    applicability: { fitClass: "Long", market: "EU" },
    scopes: [{ group: "bottoms", variant: "Men Trousers Long", leaves: ["men:bottom:trouser","men:bottom:chino"] }],
  }),
  ...sourceCharts({
    sourceTableId: "mini-girls-tops", title: "Mini Girls: T-Shirts, Tops, Knits & Sweats", audience: "girls",
    sizes: GROUPED_KID_SIZES, aliases: { eu: GROUPED_KID_SIZES, age: GROUPED_KID_AGE },
    bounds: { chest: [[54,55.5],[56,57.5],[58,62],[62.5,68]], waist: [[51,52.5],[53,54.5],[55,57],[57.5,60]] },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Girls" }, market: "EU" },
    scopes: [{ group: "tops", variant: "Mini Girls Tops", leaves: ["kids-girls:top:t-shirt","kids-girls:top:knit","kids-girls:top:hoodie","kids-girls:top:sweatshirt"] }],
  }),
  ...sourceCharts({
    sourceTableId: "mini-girls-jackets-blouses-blazers-dresses", title: "Mini Girls: Jackets, Blouses, Blazers & Dresses", audience: "girls",
    sizes: GROUPED_KID_SIZES, aliases: { eu: GROUPED_KID_SIZES, age: GROUPED_KID_AGE },
    bounds: {
      chest: [[54,55.5],[56,57.5],[58,62],[62.5,68]],
      waist: [[51,52.5],[53,54.5],[55,57],[57.5,60]],
      hip: [[54.5,58],[58.5,62],[62.5,67],[67.5,73]],
    },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Girls" }, market: "EU" },
    scopes: [
      { group: "tops", variant: "Mini Girls Blouses", leaves: ["kids-girls:top:blouse","kids-girls:top:shirt"] },
      { group: "outerwear", variant: "Mini Girls Jackets & Blazers", leaves: ["kids-girls:outerwear:jacket"] },
      { group: "dresses", variant: "Mini Girls Dresses", leaves: ["kids-girls:full-body:dress"] },
    ],
  }),
  ...sourceCharts({
    sourceTableId: "mini-girls-leggings-jogging", title: "Mini Girls: Leggings & Jogging Trousers", audience: "girls",
    sizes: GROUPED_KID_SIZES, aliases: { eu: GROUPED_KID_SIZES, age: GROUPED_KID_AGE },
    bounds: {
      waist: [[51,52.5],[53,54.5],[55,57],[57.5,60]],
      hip: [[54.5,58],[58.5,62],[62.5,67],[67.5,73]],
      inseam: [[35,41.5],[42,48.5],[49,56.5],[57,64]],
    },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Girls" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Mini Girls Leggings & Jogging", leaves: ["kids-girls:bottom:legging","kids-girls:bottom:jogger"] }],
  }),
  ...sourceCharts({
    sourceTableId: "mini-girls-skirts-elastic", title: "Mini Girls: Skirts with elastic waistband", audience: "girls",
    sizes: GROUPED_KID_SIZES, aliases: { eu: GROUPED_KID_SIZES, age: GROUPED_KID_AGE },
    bounds: { waist: [[51,52.5],[53,54.5],[55,57],[57.5,60]], hip: [[54.5,58],[58.5,62],[62.5,67],[67.5,73]] },
    applicability: { productLine: "Elastic waistband", ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Girls" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Mini Girls Skirts Elastic", leaves: ["kids-girls:bottom:skirt"] }],
  }),
  ...sourceCharts({
    sourceTableId: "mini-boys-tops", title: "Mini Boys: T-Shirts, Knits & Sweats", audience: "boys",
    sizes: GROUPED_KID_SIZES, aliases: { eu: GROUPED_KID_SIZES, age: GROUPED_KID_AGE },
    bounds: { chest: [[55.5,59],[59.5,63],[63.5,67],[67.5,71]], waist: [[51.5,53],[53.5,55],[55.5,57],[57.5,62]] },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Boys" }, market: "EU" },
    scopes: [{ group: "tops", variant: "Mini Boys Tops", leaves: ["kids-boys:top:t-shirt","kids-boys:top:knit","kids-boys:top:hoodie","kids-boys:top:sweatshirt"] }],
  }),
  ...sourceCharts({
    sourceTableId: "mini-boys-shirts-jackets-blazers", title: "Mini Boys: Shirts, Jackets & Blazers", audience: "boys",
    sizes: GROUPED_KID_SIZES, aliases: { eu: GROUPED_KID_SIZES, age: GROUPED_KID_AGE },
    bounds: {
      chest: [[55.5,59],[59.5,63],[63.5,67],[67.5,71]],
      waist: [[51.5,53],[53.5,55],[55.5,57],[57.5,62]],
      hip: [[56.5,60],[60.5,64],[64.5,68],[68.5,73.5]],
    },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Boys" }, market: "EU" },
    scopes: [
      { group: "tops", variant: "Mini Boys Shirts", leaves: ["kids-boys:top:shirt"] },
      { group: "outerwear", variant: "Mini Boys Jackets & Blazers", leaves: ["kids-boys:outerwear:jacket"] },
    ],
  }),
  ...sourceCharts({
    sourceTableId: "mini-boys-jogging-trousers", title: "Mini Boys: Jogging trousers", audience: "boys",
    sizes: GROUPED_KID_SIZES, aliases: { eu: GROUPED_KID_SIZES, age: GROUPED_KID_AGE },
    bounds: {
      waist: [[51.5,53],[53.5,55],[55.5,57],[57.5,62]],
      hip: [[55.5,59],[59.5,63],[63.5,67],[67.5,71]],
      inseam: [[33,40.5],[41,48.5],[49,56.5],[57,63.5]],
    },
    applicability: { ageBand: { minMonths: 18, maxMonths: 108, label: "Mini Boys" }, market: "EU" },
    scopes: [{ group: "bottoms", variant: "Mini Boys Jogging Trousers", leaves: ["kids-boys:bottom:jogger"] }],
  }),
];

export const TOM_TAILOR_EXPANDED_SEED: SeedChart[] = [
  ...DENIM_WOMEN,
  ...WOMEN_PLUS,
  ...MEN_FIT,
  ...GIRLS,
  ...MINI_GIRLS,
  ...BOYS,
  ...MINI_BOYS,
  ...REMAINING_OFFICIAL_TABLES,
];
