declare module "*.woff2?inline" { const dataUrl: string; export default dataUrl; }
declare module "*.ttf?inline" { const dataUrl: string; export default dataUrl; }
declare module "*.webp?url" { const url: string; export default url; }
declare module "*.webp?inline" {
  const dataUrl: string;
  export default dataUrl;
}
