import assert from 'node:assert/strict';

// Permit only the byte-identical WebP delivery alternative. Keep the original
// image, geometry and every hero animation/handler protected by existing hashes.
export function restoreApprovedHeroLoadingSource(source) {
 const crlf=source.includes('\r\n');
 const text=source.replaceAll('\r\n','\n');
 const old='<img src="/media/cova-orbital-hero-v1.png" width={1672} height={941} alt="" loading="eager" decoding="async" draggable={false} />';
 const next='<picture>\n            <source type="image/webp" srcSet="/media/cova-orbital-hero-v1.webp" />\n            <img src="/media/cova-orbital-hero-v1.png" width={1672} height={941} alt="" loading="eager" {...{ fetchpriority: "high" }} decoding="async" draggable={false} />\n          </picture>';
 if(!text.includes(next))return source;
 assert.equal(text.split(next).length,2,'Only one lossless hero image substitution');
 const restored=text.replace(next,old);
 return crlf?restored.replaceAll('\n','\r\n'):restored;
}
