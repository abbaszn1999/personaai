/** Drop-in replacement for `next/link`, aliased in at build time — the one call site that
 *  reaches this in the widget bundle (no-openai-key-gate.tsx) never actually renders in embed
 *  mode, but it's still statically imported, so this keeps the bundle buildable standalone. */
import * as React from "react";

interface LinkShimProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export default function Link({ href, children, ...rest }: LinkShimProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
