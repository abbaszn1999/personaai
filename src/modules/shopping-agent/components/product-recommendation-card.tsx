import * as React from "react";
import Image from "next/image";
import { ShoppingCart, Star } from "lucide-react";
import type { Product } from "@/modules/shopping-agent/types";
import { formatPrice } from "@/modules/shopping-agent/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProductRecommendationCardProps {
  product: Product;
}

export function ProductRecommendationCard({ product }: ProductRecommendationCardProps) {
  return (
    <div className="card-base overflow-hidden animate-slide-right">
      <div className="relative h-40 bg-[var(--color-surface-base)]">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          className="object-cover"
          unoptimized
        />
        {!product.inStock && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <Badge variant="neutral">Out of stock</Badge>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] line-clamp-2">
            {product.name}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-0.5 text-xs text-amber-500">
              <Star className="h-3 w-3 fill-current" />
              <span className="font-medium">{product.rating}</span>
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">
              ({product.reviewCount})
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-[var(--color-text-primary)]">
            {formatPrice(product.price, product.currency)}
          </span>
          <Button size="sm" disabled={!product.inStock}>
            <ShoppingCart className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
