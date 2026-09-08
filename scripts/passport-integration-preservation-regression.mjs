import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const protectedFiles = {
  "api/_lib/auth.js": "446e3e5afa5afe711f0c340143707917959ca5f9a8a4c390e7e462c06292b16a",
  "api/_lib/cookies.js": "8dd442d3e4480190c3470526ac75e410464b04df51a182dbce14fac85c2a7314",
  "api/_lib/encryption.js": "e18f0572f16dfc1cac928b23a0b1f474c012344481ed5911dcf8cea6234243bb",
  "api/_lib/legal-policy.js": "9f3798402ae4610a1c51118fd5ae45382ba6e03dc4065f9229ccfd1a4c738449",
  "api/_lib/oauth-context.js": "28bceff9a1f501ea228c47719051c2384d3c47b936871a11b1560379a8bff103",
  "api/_lib/rithmic-limit.js": "46caeb7eecd211514dd23659cf44db3b2f6d3e36794f43e46de1196ac531a3ae",
  "api/_lib/rithmic-service.js": "3b3546a8e41c2d665101c4f6a3917d94bf814a6c501ee3430e5d8e636a8e2f1a",
  "api/_lib/rithmic-systems.js": "b7552c44ea9a7cbd3137c85c56f34f2500ee1d5906075a18d3ed83f30a29795c",
  "api/_lib/supabase.js": "483d59d17f7a1e5fb7b2611554c8a828e51dff74e7c6f57cabaf142c7c4d69a7",
  "api/_lib/tradovate-capability.js": "8b8fc0d0dff72d8191d78c1b32f6686b61a676c2401b453df37dbf33ff5df26c",
  "api/_lib/urls.js": "1ba7f7e12d5fcf0c399c1b0204d1f0dbe005081d2e368997d8c80edb3218dc7d",
  "api/account/delete.js": "99ebb60740774bf90189d4b9d2af28ee963e21230aed6dd08a5eae60df22c45e",
  "api/auth/consent.js": "c71b5ae6fd461be78ecadddc0fca2459a1f5a91c3ca1fd1e25b940035013f76c",
  "api/auth/logout.js": "4d60687ec3912727183867eb9567507f0c8c0f2a91db2e6698b0e1050ca24691",
  "api/connectors/disconnect.js": "721760440d17b9923adda92953aa55a6c81f3a1c58919991d28b83e9c6ed42df",
  "api/connectors/status.js": "fdaeeb46234c8ebb77f4bb42f9409504621904c6d2d3e27b26c03be062377fce",
  "api/rithmic/status.js": "590a8f2db751e5cfc39e2fbd81c715ce93ffc95c63b3da9c11a35de65245092e",
  "api/rithmic/sync.js": "58f4b709f75568a526874cefa503adf572bc2dda7c6026905b7aeb7caa9fa8a3",
  "api/tradovate/callback.js": "6a1a6dee6f9da219d9e33eac713db6d90d22bd5bfb540f2fb28ba75125229a0b",
  "api/tradovate/connect.js": "0e32e6d9d728c0a1ee42a6b8c6edd44ee159d6c89ad7c064cd1c1502475e267d",
  "api/tradovate/sync.js": "37224093d273411c235e7c02a7d4627d2338f7f8182c60c2e3ebeb25ba28e2e0",
  "package-lock.json": "2de7e8e1b0c84266be29c1609e3185bbe58a2babe1e57e49a22538b6f2cf853e",
  "public/.well-known/security.txt": "c944f837cb8c32091a4aba3afdea372afa7ffbd058ab24b5d6fbfc285e3490d9",
  "public/cova-logo-minimal-black.svg": "539ead98bec67d21afe240ea2ff60aba7e3f9e988b4d1742e0de953f01a6f6dd",
  "public/cova-logo-minimal-white.svg": "3cab047eb026b8c3160fdab46218c0aa82978681ec9d60ec2e0116317178cbab",
  "public/media/cova-avatar-alex-r.png": "d8c7f2d529d065bb54b8508d4c421fe3bff9c8af98595112ed1dfa4a3f55605d",
  "public/media/cova-dashboard-plate.jpg": "09f2b37a05305bd23600b1cf06852f9e48cd1c21605c0a9696d34fe3c32bf3ad",
  "public/media/cova-passport-product.jpg": "623654f1f256485764e6980fc7ae86690eefab54cf078912d2a508d72a52320d",
  "public/media/cova-story-frame-02.png": "0fabb14bdbfbb61bc96826ba562d91e0476e542d3c110d0d7039398b8b9b2fde",
  "public/media/cova-story-frame-04.png": "16af62e1af810f5648f3313b282d3051f3ea30ce05d0813cc7b81235683cc161",
  "public/media/rithmic/powered-by-omne.png": "7af9acab16c4d75ddc11efd0e1011230a8cb33ffe1ea01e362706f6c70957994",
  "public/media/rithmic/trading-platform-by-rithmic.png": "187febae74c28fc370fe27a8196ba81ccc89af1150b1f641ad6b25ea5fa48cd8",
  "public/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png": "69c2fc7bf59abdc8f6b2eb6d5a62e15b8e0ada6cd6bfe6e360f87dbbf88accec",
  // Owner-approved continuity keeps one workspace shell; native-density optics
  // preserves artwork. Route-prop parity is tested in workspace-motion-regression.
  // Risk Desk content, risk/auth/provider owners and Passport artwork remain frozen.
  "src/App.tsx": "66bd93a05e265c5b912abffc36d893ad35d919f720ffe3cd61b71035eff54c51",
  "src/components/AstraEquityCurve.tsx": "0487554f9ea35b665e5b013172003a20d612f57e20662b687e5b181e26d2970f",
  "src/components/DashboardTradeDialog.tsx": "4f111aae3b8dd372eb4120d8c67821acb266a26bc2e8a374659e995cad34aae0",
  "src/components/DashboardView.tsx": "9326f89b57e4662e41f68237d1db85ee275f69dece50171ebbe2c59bb935a63d",
  "src/components/WorkspaceShell.tsx": "0b37fa65ea659158dc56a234320a978466a052232293e5a14ae4f302bc2b0aaf",
  "src/index.css": "ea8b38ada867619addaced06a8a3a1c494c1de9ef6c30beb5cbe7435890729db",
  "src/lib/risk.ts": "68a3322b983462913ef12237d89afe41faba58be8dd5f8dabd5ee0b11ce7bee0",
  "src/lib/storageScope.ts": "3cd9c57c38bb10e9f7b61776f00422ab9590bdebd1d0e458eba5a33cc676e183",
  "src/styles/astraDashboard.css": "fb12899dfb8fc4f5ccf191e61e594db1de03a866310dd2388b4baf44b997ff8b",
  "supabase/migrations/20260807010000_auth_policy_acceptances.sql": "0cf48fb5788748c426e686bf1a0c67975da1faf812a73f63a3e444e86b99cec4",
  "supabase/migrations/20260807020000_unique_broker_provider_connections.sql": "5a9b4956fb5b1a6ddf99767b633160ff0826771b6fc1db526b0acf3250594ac3",
  "supabase/migrations/20260807030000_retire_projectx_connector.sql": "e783e6bb4c0647af87ae57168e237a566182be4923cd1622717765abef45ab0c",
  "supabase/tradovate_connector.sql": "07b2ed7375a58fc128cb193a88cbbba59ea72dc2e23dc074481d539d3d663976",
  "src/assets/fonts/ALLURA-OFL.txt": "eea1157c41ebcbb7bb6732328f2a804a56b3f2744e456a116311aa2eb8cafce4",
  "src/assets/fonts/Allura-Regular.ttf": "9c142b2e515832c0dfc4ff8b8ea18f40314943bf937b72e2b23c4661bac14cc6",
  "src/assets/fonts/INTER-TIGHT-OFL.txt": "1e1c8b3dc6dfcbd5498a33f17fcc68ff2d39c599f6e8195fbf14601261dbef6a",
  "src/assets/fonts/passport-inter-tight.woff2": "77fefe8ca19b9f69b5284832c519e0493127c1f091f0a8936884be7721c4e618",
  "src/assets/passport-bronze-material.webp": "2544f598a70fca7450da982e97c1c0a17d96a75006eac4cc633b6079dafd751b",
  "src/assets/passport-diamond-material.webp": "8812c133cc654e5d7f8988ede53e427b34fd15ee996e14b8a2ef8824c536acc1",
  "src/assets/passport-gold-material.webp": "ba1064e2c2e0fcd90dab417127458eaadf906899b93dee232701cd7f804ad4a1",
  "src/assets/passport-market-maker-material.webp": "46cd56c32fcbb8ea8df0ccea1937bb5624033a09e1398754b21c9cf29b57c897",
  "src/assets/passport-neutral-material.webp": "98b461f579c7b1072a6f2b9bd65f789c63f6a6964e0e7480d13c6f71046c7f94",
  "src/assets/passport-pearl-material.webp": "d6f45f4648ce7e76b1cbcc5738b92248b78a63d2f5ae643a36d36d94d72dd61b",
  "src/assets/passport-platinum-material.webp": "b844669c0c5be7898e7cd8f906aace1d55731adb1ac8b084ad99bbc04a2295af",
  "src/assets/passport-silver-material.webp": "373c4660acf69ce826aec7b14e0337192be8a946a599975d7867a3efc478e2c5",
  "src/assets/passport-square-bronze-material.webp": "e58805d273cb98c237afb2651605915d3eeba11d7f255264d2d26fab81a3de37",
  "src/assets/passport-square-diamond-material.webp": "296b357d3e7b52ff2b599b542ac04c2f5a128a27be4530aeac939eeae8c9b722",
  "src/assets/passport-square-gold-material.webp": "0bd1dd3bb12220d56a1c9463151b314bbdef68eaadabcf5b032e5274c818c890",
  "src/assets/passport-square-market-maker-material.webp": "3b6edab8d7c3e28a16c7a5ad3d9e4fc6886e5583e87814887a627b06f0584ec5",
  "src/assets/passport-square-neutral-material.webp": "1c3e929fa071ede959f2dc7d02097b2fc2d4d844b1692901d7f67a0d3f8a0070",
  "src/assets/passport-square-platinum-material.webp": "43858710708404df744b00526d3bbd86d4b8e005e0c028a5c97c61ffbd09e016",
  "src/assets/passport-square-silver-material.webp": "a809357e8605c22e17acfc366ba73a4672e1fdfffef095717d64f32835725bee",
  "src/components/PassportEtchedContent.tsx": "ea395bed2473dff8f2cc530a9b8eed837d8bf9933b744db4a8a32306778b9481",
  "src/components/PassportHoloCard.tsx": "aba6bb8294044f0dd37b7573a7aceb5219ce6d608e350470133216adef59eb07",
  "src/lib/passportEngraving.ts": "f434163673b3dbc8c84be759b025927f5340dd95329fc903d1d7463c4e566f82",
  "src/lib/passportHolo.ts": "1620a81c4ee962aa58694c1bf8b0da7dd80b6b37bde1b61e7e06d6c6844c308a",
  "src/lib/passportHoloExport.ts": "3b2a42ba41b829702e6d2aa83171cfccc4f07441a4f2645b8f28f83795d339da",
  "src/lib/passportMaterials.ts": "1d84c8f36205c468dd4007d7aaaebd745dc41cb7dd534931302072ff0bc1903c",
  "src/lib/passportOptics.ts": "04ce7bdf59de25713e1df7e047b290835c87e4ee4ee9fbff001fcf2f6856ab10",
  "src/lib/passportOpticsShader.ts": "f8b822b587fc24fa3e45ba82520306310bb0604b2ac3345fd7cf5d2fcf48e390",
  "src/lib/passportShare.ts": "38970562709719e90f52744862dfb8591a54e22cab56bd2d79399ac029533cb9",
  "src/lib/passportShareActions.ts": "c38266721f9f611bdbf139f5699ff6650497b0652516b3e5b3b30fc453ff0694",
  "src/lib/passportSquare.ts": "fc6b0d1fa28e405c27d6248c675790b212b54aabef98897e7c8c65af62cd9478",
  "src/lib/passportSquareMaterials.ts": "0863b22685ff647ac2e8595e26f2941f721510317969b8399fccec2d362e7b8d",
  "src/passport-material.d.ts": "076aa1fab1200cf6a41eae836fbc11313ae70f461a79c58626fff977ee74106b",
  "src/styles/passportHolo.css": "c14bb8c783da3285d39d65184fccb13bdf59bbc5a508f639e834c4828a98ae79",
  "src/styles/passportShare.css": "8b4cfb8779f4d906713d62d8aa395e1d8ee202779e975fc2d5ee86573057d046"
};
// Git can check text out as LF or CRLF. Normalize only line endings in known text
// files; binary artwork and fonts remain byte-exact. Do not trim other whitespace.
function protectedDigest(path, bytes) {
 const content = /\.(?:css|js|json|md|mjs|sql|svg|ts|tsx|txt)$/.test(path)
  ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes;
 return createHash('sha256').update(content).digest('hex');
}
test('integration preserves protected content across Git text line endings and exact binary assets', () => {
 for (const [path,expected] of Object.entries(protectedFiles)) {
  assert.equal(protectedDigest(path, readFileSync(new URL('../'+path,import.meta.url))),expected,path);
 }
 assert.ok(Object.keys(protectedFiles).length>50);
});
test('preservation normalizes only text CRLF, retaining content and binary mutation detection', () => {
 const lf = Buffer.from('value = 1;\n'), crlf = Buffer.from('value = 1;\r\n');
 assert.equal(protectedDigest('owner.tsx', lf), protectedDigest('owner.tsx', crlf));
 assert.notEqual(protectedDigest('owner.tsx', lf), protectedDigest('owner.tsx', Buffer.from('value = 2;\n')));
 assert.notEqual(protectedDigest('owner.tsx', lf), protectedDigest('owner.tsx', Buffer.from('value = 1; \n')));
 assert.notEqual(protectedDigest('material.webp', lf), protectedDigest('material.webp', crlf));
 assert.notEqual(protectedDigest('font.ttf', lf), protectedDigest('font.ttf', crlf));
});
