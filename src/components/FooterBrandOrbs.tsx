import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";

const BrandOrbs = lazy(() =>
  import("./brandOrbs/BrandOrbs").then((module) => ({ default: module.BrandOrbs })),
);

type OrbLinkProps = {
  ariaLabel: string;
  children: ReactNode;
  href: string;
  external?: boolean;
};

function OrbLink({ ariaLabel, children, external = false, href }: OrbLinkProps) {
  return (
    <a
      aria-label={ariaLabel}
      className="cova-site-footer-orb"
      href={href}
      rel={external ? "noopener noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {children}
    </a>
  );
}

function OrbFallback() {
  return <span aria-hidden="true" className="cova-site-footer-orb-placeholder" />;
}

export function FooterBrandOrbs() {
  const groupRef = useRef<HTMLElement>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldMount(true);
        observer.disconnect();
      },
      { rootMargin: "480px 0px" },
    );

    observer.observe(group);
    return () => observer.disconnect();
  }, []);

  return (
    <nav aria-label="Social media and contact" className="cova-site-footer-orbs" ref={groupRef}>
      <OrbLink ariaLabel="Cova on X" external href="https://x.com/covadesk">
        <Suspense fallback={<OrbFallback />}>
          {shouldMount ? <BrandOrbs variant="x" size="small" /> : <OrbFallback />}
        </Suspense>
      </OrbLink>
      <OrbLink ariaLabel="Cova on Instagram" external href="https://www.instagram.com/covadesk/">
        <Suspense fallback={<OrbFallback />}>
          {shouldMount ? <BrandOrbs variant="instagram" size="small" /> : <OrbFallback />}
        </Suspense>
      </OrbLink>
    </nav>
  );
}
