import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Package,
  CheckCircle2,
  AlertCircle,
  Tag,
  Layers,
  ArrowRight,
  SlidersHorizontal,
  ExternalLink,
  Eye,
  Check,
} from 'lucide-react';
import { StoreCategoryItem } from '../data/personaTaxonomyData';

export interface SamplePlpItem {
  id: string;
  sku: string;
  title: string;
  price: string;
  sizes: string[];
  color: string;
  stockQty: number;
  imageUrl: string;
  inStock: boolean;
  material: string;
}

// Generate realistic sample products for any PLP category
export function generatePlpItems(category: StoreCategoryItem): SamplePlpItem[] {
  const name = category.name.toLowerCase();
  const path = category.storePath.toLowerCase();

  let type: 'hoodie' | 'tshirt' | 'sweater' | 'dress' | 'jean' | 'shorts' | 'pants' | 'coat' | 'blazer' | 'heels' | 'sandals' | 'slides' | 'baby' | 'kids' | 'general' = 'general';

  if (name.includes('hoodie') || path.includes('fleece') || path.includes('hoodie')) {
    type = 'hoodie';
  } else if (name.includes('t-shirt') || name.includes('tee') || path.includes('tee')) {
    type = 'tshirt';
  } else if (name.includes('crewneck') || name.includes('sweater') || name.includes('knit') || name.includes('cardigan')) {
    type = 'sweater';
  } else if (name.includes('dress') || name.includes('gown') || path.includes('dress')) {
    type = 'dress';
  } else if (name.includes('jean') || name.includes('denim') || path.includes('denim')) {
    type = 'jean';
  } else if (name.includes('short') || path.includes('shorts')) {
    type = 'shorts';
  } else if (name.includes('chino') || name.includes('pant') || name.includes('trouser')) {
    type = 'pants';
  } else if (name.includes('coat') || name.includes('trench') || name.includes('overcoat')) {
    type = 'coat';
  } else if (name.includes('blazer') || path.includes('suiting')) {
    type = 'blazer';
  } else if (name.includes('heel') || name.includes('pump')) {
    type = 'heels';
  } else if (name.includes('sandal') || path.includes('sandal')) {
    type = 'sandals';
  } else if (name.includes('slide') || name.includes('slip-on')) {
    type = 'slides';
  } else if (name.includes('sleepsuit') || name.includes('baby') || path.includes('newborn')) {
    type = 'baby';
  } else if (name.includes('girl') || name.includes('boy') || path.includes('kids')) {
    type = 'kids';
  }

  const templates: Record<typeof type, {
    titles: string[];
    prices: string[];
    colors: string[];
    sizes: string[];
    materials: string[];
    images: string[];
  }> = {
    hoodie: {
      titles: [
        'Heavyweight Acid-Wash French Terry Hoodie',
        'Oversized Drop-Shoulder Fleece Pullover',
        'Downtown Minimalist Zip-Up Hoodie',
        'Boxy Garment-Dyed Relaxed Hoodie',
        'Thermal-Lined Streetwear Hooded Sweatshirt',
        'Vintage Raw-Hem Heavy Fleece Hoodie',
        'Signature Chenille Logo Pullover Hoodie',
        'Brushed Heavy Cotton Kangaroo Hoodie',
      ],
      prices: ['$88.00', '$95.00', '$105.00', '$82.00', '$110.00', '$92.00', '$98.00', '$85.00'],
      colors: ['Charcoal Slate', 'Washed Black', 'Heather Grey', 'Vintage Bone', 'Sage Green', 'Espresso', 'Clay Brown', 'Dusty Rose'],
      sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
      materials: ['100% Organic Carded Cotton (450 GSM)', 'Heavy French Terry Cotton', 'Recycled Poly-Fleece Blend'],
      images: [
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1543087903-1ac2ec7aa8c5?w=400&auto=format&fit=crop&q=80',
      ],
    },
    tshirt: {
      titles: [
        'Vintage Boxy Drop-Shoulder Tee',
        '240 GSM Carded Organic Cotton Crewneck',
        'Garment-Dyed Relaxed Heavyweight T-Shirt',
        'Minimalist Essential Pocket T-Shirt',
        'Downtown Graphic Studio Tee',
        'Acid Wash Retro Streetwear T-Shirt',
        'Mercerized Cotton Premium Crewneck',
        'Classic Ribbed Collar Casual Tee',
      ],
      prices: ['$38.00', '$42.00', '$45.00', '$36.00', '$48.00', '$40.00', '$52.00', '$34.00'],
      colors: ['Off-White', 'Pitch Black', 'Forest Green', 'Washed Navy', 'Sand Dunes', 'Charcoal', 'Muted Olive'],
      sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      materials: ['100% Combed Ring-Spun Cotton', '240 GSM Organic Jersey', 'Slub Textured Cotton'],
      images: [
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400&auto=format&fit=crop&q=80',
      ],
    },
    sweater: {
      titles: [
        'Grade-A Mongolian Cashmere Crewneck',
        'Fine-Gauge Merino Wool Knit Pullover',
        'Chunky Cable-Knit Fisherman Sweater',
        'Seamless Ribbed Wool Cardigan',
        'Relaxed Brushed Alpaca Blend Sweater',
        'Waffle Knit Cotton Everyday Pullover',
        'Mock Neck Structured Wool Knit',
        'V-Neck Lightweight Cashmere Sweater',
      ],
      prices: ['$165.00', '$140.00', '$185.00', '$135.00', '$155.00', '$89.00', '$148.00', '$175.00'],
      colors: ['Oatmeal Heather', 'Camel Tan', 'Midnight Navy', 'Charcoal Melange', 'Ivory Cream', 'Burgundy Wine'],
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      materials: ['100% Grade-A Mongolian Cashmere', 'Extra-Fine Merino Wool', 'Alpaca & Wool Blend'],
      images: [
        'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400&auto=format&fit=crop&q=80',
      ],
    },
    dress: {
      titles: [
        'Silk Satin Bias-Cut Evening Slip Dress',
        'Architectural Pleated Maxi Gown',
        'Strapless Structured Crepe Cocktail Dress',
        'Draped Cowl Neck Silk Midi Dress',
        'Tiered Chiffon A-Line Occasion Gown',
        'Tailored Blazer Mini Dress',
        'Ruched Velvet Column Gown',
        'Flowing Floral Silk Organza Maxi',
      ],
      prices: ['$195.00', '$240.00', '$185.00', '$220.00', '$260.00', '$170.00', '$210.00', '$190.00'],
      colors: ['Emerald Green', 'Champagne Gold', 'Midnight Black', 'Ruby Crimson', 'Dusty Lavender', 'Royal Sapphire'],
      sizes: ['US 0', 'US 2', 'US 4', 'US 6', 'US 8', 'US 10', 'US 12'],
      materials: ['100% Silk Charmeuse', 'Heavy Crepe de Chine', 'Pleated Chiffon Overlay'],
      images: [
        'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=400&auto=format&fit=crop&q=80',
      ],
    },
    jean: {
      titles: [
        'Classic High-Rise Straight Leg Denim',
        'Vintage Relaxed 90s Boyfriend Jean',
        'Sculpting Ankle Skinny Denim',
        'Wide Leg Rigid Raw Denim Pant',
        'Cropped Flare Selvedge Jean',
        'Washed Black Minimalist Straight Jean',
        'Distressed Tapered Everyday Denim',
        'Comfort Stretch Low-Rise Jean',
      ],
      prices: ['$98.00', '$115.00', '$89.00', '$125.00', '$110.00', '$95.00', '$105.00', '$85.00'],
      colors: ['Vintage Light Indigo', 'Washed Medium Blue', 'Raw Dark Indigo', 'Faded Charcoal', 'Optic White'],
      sizes: ['24', '25', '26', '27', '28', '29', '30', '31', '32'],
      materials: ['100% Cotton 13oz Ring-Spun Denim', '99% Cotton, 1% Elastane', 'Japanese Selvedge Denim'],
      images: [
        'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1542272604-780c96856592?w=400&auto=format&fit=crop&q=80',
      ],
    },
    shorts: {
      titles: [
        'High-Rise Cutoff Denim Shorts',
        'Relaxed Pleated Linen Casual Shorts',
        'Vintage 5-Pocket Raw-Hem Shorts',
        'Everyday Tailored Bermuda Shorts',
        'Comfort Stretch Denim Mom Shorts',
        'Camp Collar Utility Cargo Shorts',
      ],
      prices: ['$58.00', '$65.00', '$54.00', '$70.00', '$56.00', '$62.00'],
      colors: ['Washed Light Denim', 'Ecru White', 'Faded Indigo', 'Olive Drab', 'Black Stone Wash'],
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      materials: ['100% Rigid Denim', 'Pure European Linen', 'Stretch Cotton Twill'],
      images: [
        'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=400&auto=format&fit=crop&q=80',
      ],
    },
    pants: {
      titles: [
        'Relaxed Tapered Stretch Chino',
        'Pleated Front Cotton Twill Pant',
        'Casual Elastic-Waist Easy Pant',
        'Slim-Fit Garment-Dyed Chinos',
        'Wide Leg Tailored Wool Trousers',
        'Minimalist Drawstring Linen Trouser',
      ],
      prices: ['$78.00', '$88.00', '$72.00', '$85.00', '$115.00', '$92.00'],
      colors: ['British Khaki', 'Olive Green', 'Navy Blue', 'Stone Grey', 'Espresso Dark Brown', 'Black'],
      sizes: ['30x30', '31x30', '32x32', '33x32', '34x32', '36x32'],
      materials: ['98% Cotton, 2% Spandex Twill', 'Fine Combed Chino Twill', 'Garment-Washed Gabardine'],
      images: [
        'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=400&auto=format&fit=crop&q=80',
      ],
    },
    coat: {
      titles: [
        'Double-Faced Tailored Wool Overcoat',
        'Classic Camel Hair Car Coat',
        'Water-Resistant Double-Breasted Trench',
        'Cashmere-Blend Minimalist Topcoat',
        'Relaxed Belted Wool Robe Coat',
        'Structured Raglan Sleeve Overcoat',
      ],
      prices: ['$295.00', '$340.00', '$245.00', '$380.00', '$280.00', '$310.00'],
      colors: ['Camel', 'Charcoal Melange', 'Deep Navy', 'Warm Taupe', 'Pitch Black'],
      sizes: ['38R', '40R', '42R', '44R', '46R'],
      materials: ['80% Virgin Wool, 20% Cashmere', 'Italian Milled Melton Wool', 'Heavy Gabardine'],
      images: [
        'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=400&auto=format&fit=crop&q=80',
      ],
    },
    blazer: {
      titles: [
        'Double-Breasted Tailored Crepe Blazer',
        'Single-Breasted Italian Wool Jacket',
        'Oversized Boyfriend Suiting Blazer',
        'Structured Pinstripe Wool Blazer',
        'Linen Summer Unstructured Jacket',
        'Cropped Tuxedo Lapel Blazer',
      ],
      prices: ['$185.00', '$210.00', '$175.00', '$195.00', '$160.00', '$165.00'],
      colors: ['Black', 'Oatmeal', 'Navy Chalkstripe', 'Mocha Brown', 'Ivory'],
      sizes: ['US 2', 'US 4', 'US 6', 'US 8', 'US 10', 'US 12'],
      materials: ['Wool Crepe with Viscose Lining', 'Stretch Tropical Wool', 'Pure Linen Weave'],
      images: [
        'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1548883354-7622d03aca27?w=400&auto=format&fit=crop&q=80',
      ],
    },
    heels: {
      titles: [
        'Stiletto Pointed-Toe 90mm Pump',
        'Strappy Minimalist Block Heel Sandal',
        'Kitten Heel Slingback Leather Pump',
        'Square-Toe Sculptural Mid-Heel Mule',
        'Ankle-Wrap Metallic Party Heel',
        'Platform Patent Leather Heel',
      ],
      prices: ['$135.00', '$120.00', '$115.00', '$145.00', '$150.00', '$130.00'],
      colors: ['Nude Bisque', 'Pitch Black Patent', 'Crimson Red', 'Metallic Gold', 'Espresso Leather'],
      sizes: ['EU 36 (US 5.5)', 'EU 37 (US 6.5)', 'EU 38 (US 7.5)', 'EU 39 (US 8.5)', 'EU 40 (US 9.5)', 'EU 41 (US 10.5)'],
      materials: ['Italian Calfskin Leather', 'Suede Upper with Leather Sole', 'Embossed Crocodile Finish'],
      images: [
        'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1562273138-f46be4ebdf33?w=400&auto=format&fit=crop&q=80',
      ],
    },
    sandals: {
      titles: [
        'Strappy Block Heel Leather Sandal',
        'Cushioned Footbed Ankle-Strap Sandal',
        'Woven Leather Fisherman Slide Sandal',
        'Mid-Heel Knot Detail Mule',
        'Braided Leather Espadrille Wedge',
        'Minimalist Thong Heeled Sandal',
      ],
      prices: ['$110.00', '$95.00', '$125.00', '$105.00', '$115.00', '$98.00'],
      colors: ['Tan Leather', 'Ivory', 'Cognac', 'Black Suede', 'Terracotta'],
      sizes: ['EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40'],
      materials: ['Handcrafted Full Grain Leather', 'Anatomical Cork Footbed', 'Natural Jute Sole'],
      images: [
        'https://images.unsplash.com/photo-1562273138-f46be4ebdf33?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&auto=format&fit=crop&q=80',
      ],
    },
    slides: {
      titles: [
        'Poolside Molded EVA Comfort Slide',
        'Contoured Minimalist Rubber Slip-On',
        'Platform Cloud Foam Recovery Slide',
        'Sport Slide with Adjustable Hook Strap',
        'Waterproof Beach & Pool Slide',
        'Ergonomic Textured Tread Slide',
      ],
      prices: ['$38.00', '$45.00', '$52.00', '$40.00', '$35.00', '$48.00'],
      colors: ['Bone Sand', 'Triple Black', 'Sage Mist', 'Terracotta Red', 'Midnight Navy'],
      sizes: ['US 6', 'US 7', 'US 8', 'US 9', 'US 10', 'US 11', 'US 12'],
      materials: ['Single-Piece Compression-Molded EVA', 'Anti-Slip Hydrophobic Foam', 'Waterproof Rubber Sole'],
      images: [
        'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=80',
      ],
    },
    baby: {
      titles: [
        'Organic Cotton Two-Way Zip Sleepsuit',
        'Ribbed Modal Footed All-In-One',
        'Bamboo Fiber Snug-Fit Baby Romper',
        'Thermal Waffle Knit Unisex Sleepwear',
        'Soft Breathable Kimono Snap Sleepsuit',
        'Long-Sleeve Foldover Cuffs Pajama',
      ],
      prices: ['$28.00', '$32.00', '$34.00', '$26.00', '$30.00', '$25.00'],
      colors: ['Cloud Cream', 'Dusty Sage', 'Oatmeal', 'Powder Blue', 'Muted Terracotta', 'Warm Honey'],
      sizes: ['0-3M', '3-6M', '6-9M', '9-12M', '12-18M'],
      materials: ['100% GOTS Certified Organic Cotton', '95% Bamboo Viscose, 5% Spandex', 'Nickel-Free Snaps'],
      images: [
        'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=400&auto=format&fit=crop&q=80',
      ],
    },
    kids: {
      titles: [
        'Girls Pleated School & Tennis Skirt',
        'Boys Puffer Snowsuit with Sherpa Hood',
        'Kids Knit Cardigan with Horn Buttons',
        'Girls Layered Tulle & Twill Skort',
        'Kids All-Weather Insulated Snow Overall',
        'Fine-Knit Cotton Kids Bolero Cardigan',
      ],
      prices: ['$36.00', '$85.00', '$42.00', '$38.00', '$92.00', '$34.00'],
      colors: ['Navy Blue', 'Forest Green', 'Burgundy Red', 'Heather Grey', 'Plum Pink'],
      sizes: ['4Y', '6Y', '8Y', '10Y', '12Y', '14Y'],
      materials: ['Anti-Pill Cotton Blend', 'Water-Repellent Poly Oxford', '100% Cotton Knit'],
      images: [
        'https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400&auto=format&fit=crop&q=80',
      ],
    },
    general: {
      titles: [
        `${category.name} - Essential Item 01`,
        `${category.name} - Classic Core 02`,
        `${category.name} - Premium Signature 03`,
        `${category.name} - Relaxed Fit 04`,
        `${category.name} - Heritage Edition 05`,
        `${category.name} - Modern Cut 06`,
      ],
      prices: ['$55.00', '$68.00', '$75.00', '$62.00', '$89.00', '$59.00'],
      colors: ['Black', 'Grey Heather', 'Off-White', 'Navy', 'Olive'],
      sizes: ['S', 'M', 'L', 'XL'],
      materials: ['Premium Apparel Blend', 'Garment-Treated Cotton'],
      images: [
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&auto=format&fit=crop&q=80',
      ],
    },
  };

  const selectedTemplate = templates[type];
  const items: SamplePlpItem[] = [];
  const count = Math.min(8, selectedTemplate.titles.length);
  const prefix = category.id.replace('sc-', '').toUpperCase();

  for (let i = 0; i < count; i++) {
    const title = selectedTemplate.titles[i];
    const price = selectedTemplate.prices[i % selectedTemplate.prices.length];
    const color = selectedTemplate.colors[i % selectedTemplate.colors.length];
    const material = selectedTemplate.materials[i % selectedTemplate.materials.length];
    const imageUrl = selectedTemplate.images[i % selectedTemplate.images.length];
    const sku = `SKU-${prefix}-${String(100 + i * 7).padStart(4, '0')}`;
    const stockQty = 12 + ((i * 17) % 65);

    items.push({
      id: `${category.id}-item-${i + 1}`,
      sku,
      title,
      price,
      sizes: selectedTemplate.sizes,
      color,
      stockQty,
      imageUrl,
      inStock: stockQty > 0,
      material,
    });
  }

  return items;
}

interface CategoryItemsPreviewModalProps {
  category: StoreCategoryItem | null;
  onClose: () => void;
  onSelectForMapping?: (category: StoreCategoryItem) => void;
}

export function CategoryItemsPreviewModal({
  category,
  onClose,
  onSelectForMapping,
}: CategoryItemsPreviewModalProps) {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const items = useMemo(() => {
    if (!category) return [];
    return generatePlpItems(category);
  }, [category]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.color.toLowerCase().includes(q) ||
        item.sizes.some((s) => s.toLowerCase().includes(q))
    );
  }, [items, search]);

  if (!category) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight truncate">
                  {category.name}
                </h2>

                <span className="text-xs font-mono font-bold text-purple-700 bg-purple-100/90 px-2 py-0.5 rounded-md border border-purple-200">
                  {category.productCount} Total SKUs
                </span>

                {category.status === 'mapped' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Mapped
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    Unmapped
                  </span>
                )}
              </div>

              {/* Path Display */}
              <div className="text-xs text-slate-500 font-mono mt-1 flex items-center gap-1.5 truncate">
                <span className="text-slate-400 select-none">Store Route:</span>
                <span className="text-slate-700 font-semibold truncate">{category.storePath}</span>
              </div>

              {/* Assigned Persona Path if mapped */}
              {category.assignedPersonaPath && (
                <div className="text-xs text-purple-700 font-mono mt-1 flex items-center gap-1.5 truncate">
                  <span className="text-slate-400 font-sans font-medium text-[11px]">Persona Mapping:</span>
                  <span className="bg-purple-100 text-purple-900 px-1.5 py-0.2 rounded font-bold border border-purple-200 truncate">
                    {category.assignedPersonaPath}
                  </span>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer shrink-0"
            title="Close modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Toolbar (Search + View Toggle) */}
        <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-white">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items by title, SKU code, size, color..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-medium transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <span className="text-xs font-medium text-slate-500">
              Showing {filteredItems.length} of {category.productCount} SKUs
            </span>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-purple-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-purple-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>

        {/* Modal Content / Items */}
        <div className="p-4 sm:p-5 overflow-y-auto max-h-[58vh] bg-slate-50/50">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-2">
              <Package className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-700">No items match your search filter</p>
              <p className="text-[11px] text-slate-400">Try clearing the search box to view all catalog items.</p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-xs font-bold text-purple-700 hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs hover:shadow-sm hover:border-purple-300 transition-all flex flex-col group"
                >
                  <div className="relative aspect-4/3 bg-slate-100 overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 left-2">
                      <span className="text-[10px] font-mono font-bold bg-black/75 text-white px-1.5 py-0.5 rounded backdrop-blur-xs">
                        {item.sku}
                      </span>
                    </div>
                    <div className="absolute bottom-2 right-2">
                      <span className="text-xs font-extrabold text-slate-900 bg-white/95 px-2 py-0.5 rounded-md shadow-2xs">
                        {item.price}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                        {item.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 truncate">
                        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                        <span className="truncate">{item.color}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-400 text-[10px] truncate">{item.material}</span>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[11px]">
                      <div className="flex items-center gap-1 flex-wrap">
                        {item.sizes.slice(0, 3).map((s) => (
                          <span
                            key={s}
                            className="text-[9px] font-bold font-mono px-1 py-0.2 bg-slate-100 text-slate-600 rounded"
                          >
                            {s}
                          </span>
                        ))}
                        {item.sizes.length > 3 && (
                          <span className="text-[9px] text-slate-400">+{item.sizes.length - 3}</span>
                        )}
                      </div>

                      <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 whitespace-nowrap">
                        {item.stockQty} in stock
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3">Item</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Price</th>
                    <th className="py-2.5 px-3">Color / Material</th>
                    <th className="py-2.5 px-3">Sizes</th>
                    <th className="py-2.5 px-3 text-right">Inventory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-purple-50/40 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
                          />
                          <span className="font-bold text-slate-900 line-clamp-1">{item.title}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 font-medium">{item.sku}</td>
                      <td className="py-2.5 px-3 font-extrabold text-slate-900">{item.price}</td>
                      <td className="py-2.5 px-3 text-slate-600 truncate max-w-[140px]">
                        {item.color} • {item.material}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {item.sizes.map((s) => (
                            <span
                              key={s}
                              className="text-[9px] font-mono font-bold px-1 py-0.2 bg-slate-100 text-slate-600 rounded"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {item.stockQty} units
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-medium">
            Category ID: <code className="font-mono text-slate-700">{category.id}</code>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>

            {onSelectForMapping && (
              <button
                type="button"
                onClick={() => {
                  onSelectForMapping(category);
                  onClose();
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Select for Mapping</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
