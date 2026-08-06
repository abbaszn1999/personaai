/**
 * Drop-in replacement for `next/image`, aliased in at build time (see
 * scripts/build-widget.mjs) so the wearable-agent components can be reused unmodified
 * outside Next.js. Every usage in that module passes `unoptimized` + either `fill` or an
 * explicit width/height, so a plain `<img>` covers every call site actually in use.
 */
import * as React from "react";

interface ImageShimProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  alt: string;
  fill?: boolean;
  unoptimized?: boolean;
  priority?: boolean;
}

export default function Image({ src, alt, fill, unoptimized, priority, style, ...rest }: ImageShimProps) {
  void unoptimized;
  void priority;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- this *is* the next/image replacement, outside Next's pipeline entirely.
    <img
      src={src}
      alt={alt}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
      {...rest}
    />
  );
}
