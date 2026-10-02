# Isolated TEST deployment packaging

The failed Preview `dpl_G184eseceZt4fvKgSTvSDHXJH1ni` exceeded Hobby's 12-function limit with 13 API source entrypoints. Its server compiler also reported TS2307/2580 (Node types) and TS2835 (extensionless shared TypeScript imports). The frontend build did not detect these server diagnostics.

`scripts/prepare-test-deployment.mjs` produces a separate source tree from a clean committed checkout. It does not change normal `vercel.json`, dependencies, handlers, SQL, or production packaging. It uses the existing Vite server-runtime generation approach to compile Passport and workspace into native JavaScript, avoiding Vercel's implicit NodeNext compilation of frontend/shared TypeScript. Node built-ins and npm dependencies remain runtime imports; Vercel traces these normally.

Only the related connector status and disconnect endpoints share a function. Both original handlers are bundled unchanged into `api/connectors/[action].js`; the dispatcher selects the exact request pathname, preserves the original request, and rejects unknown paths. Method, authentication, policy, provider, cookie and origin behavior stays in the existing handlers. Billing remains a separate function with raw-body parsing disabled. All other endpoints remain separate. The existing Tradovate status rewrite, security headers, redirects and Rithmic durations are unchanged.

## Review and local verification

From the source checkout with dependencies installed:

```sh
node scripts/prepare-test-deployment.mjs /absolute/new/test-stage
npm run test:workspace
```

The stage must be outside the checkout and must not already exist. Tracked environment files are excluded. The generated `test-source-manifest.json` records the original commit/tree and staged file hashes. Keep the source checkout for tests and edits; generated staged runtimes are not editable source.

Using official Vercel CLI 62.1.0, run `vercel build` **in the stage** with the existing authorized TEST project binding and Preview configuration. Do not use `--prod` or `--id`. Then run from the source checkout:

```sh
node scripts/verify-test-deployment.mjs /absolute/new/test-stage
```

The verifier asserts 12 emitted Node24 functions, imports every emitted runtime natively, compares connector behaviors against the originals without external requests, checks billing raw-body config, routes, security headers and durations, and reruns the workspace API regression suite against the actual emitted function module.

No deployment is authorized by this document. The candidate must be reviewed before another TEST Preview attempt. Production must not use this staging workflow without separate review. No additional migration is needed; the reviewed TEST SQL is unchanged.

## Local evidence and limits

The local official CLI build uses a task-local credential-free project settings file (Vite, Node24, npm ci, npm run build, dist), with no downloaded environment values. It exercises official API discovery, Node builders and Build Output API generation. Its output has 12 `.func` directories and no server TypeScript diagnostics. It is not evidence of authenticated remote publishing, hosted rewrite behavior, or live A/B sync. Those checks remain necessary on a reviewed READY TEST Preview.

`vercel dev` requested authentication and could not run in this environment. No account grant or login completed. Native emitted-function tests and output-route assertions are used locally; remote end-to-end route checks remain explicit follow-up work.
