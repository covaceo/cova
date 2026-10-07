# Account dropdown source provenance

The account picker adapts Watermelon's published `dropdown-menu-10` component, installed using the owner-provided registry command in an isolated staging project:

```sh
npx shadcn@latest add https://registry.watermelon.sh/r/dropdown-menu-10.json
```

The installed original component matched the registry source byte-for-byte after text line-ending normalization. Original SHA-256: `137eda1748a21d02003a022ed126f334330d3014fdfee8f156d4f10f273be10a`.

Adaptations replace demo developer-preference toggles with Cova's authoritative account choices and existing guarded account-change callback. Selection remains controlled and singular. Owner remounting and edit-lock handling protect the portalled popup. Scoped styling avoids Cova's global pill-radius token, and the generated button forwards its ref for the existing React 18 runtime.

Generated button/menu primitives come from the shadcn registry resolved by that command. Added runtime packages are pinned: `cn` 0.4.0 (MIT), `radix-ui` 1.7.0 (MIT), `react-icons` 5.7.0 (MIT package; icon collections retain their own notices), and `class-variance-authority` 0.7.1 (Apache-2.0). Font Awesome icons are provided through react-icons/fa6; preserve the package and icon-library license notices when redistributing.

No account-history migration, broker mutation, new cloud-consent behavior, or financial-calculation change accompanies this presentation patch.
