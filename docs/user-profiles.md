# Cova account profiles

Owner-approved contract: usernames are unique across Cova accounts, ignoring case. Account lookup is **database/admin only** by exact username or email. Sign-in remains email-based. Do not add a public email-directory or username login as an incidental change.

## Rules
- 3–24 ASCII letters, digits, or underscores; normalize to lowercase and remove one optional leading `@`.
- `public.user_profiles.username` has a database UNIQUE constraint and lowercase ASCII CHECK. A client-side availability check is never the authority; competing saves must be resolved by the database constraint.
- `user_id` references `auth.users(id)` with cascade deletion. RLS and restricted grants permit authenticated users to select/insert/update only their own profile.
- Existing users do not receive invented usernames. Their fallback is **Set username** until they save a profile. Existing email login, account IDs, broker account names, and trade records do not change.
- Profile photos are decoded, center-cropped to 256×256, and re-encoded as JPEG. Only JPG/PNG/WebP inputs up to 5 MB are accepted. Store only this bounded thumbnail (at most 100,000 ASCII characters) in the owner-private profile row, atomically with the username. No public upload bucket, remote image URL, original EXIF, or SVG. This intentionally small private-avatar representation avoids orphaned uploads and follows auth-user deletion automatically.
- Save failures retain the prior profile. Identity changes abort old requests and close the profile dialog. No browser-only success is presented as persistence.

## Username change cooldown
- Once assigned, a username can change only after 14 elapsed days (336 hours). PostgreSQL owns `username_changed_at` and enforces the rule for direct updates and upserts; browser restrictions are only a convenience.
- Apply `20260920020000_username_change_cooldown.sql` before the updated UI. Existing profiles start their first window at migration time because prior change history was not tracked. New profiles start at creation.
- The trigger ignores client-supplied timestamps. Photo-only and unchanged-name saves remain allowed and preserve the last name-change timestamp. Deleting a profile to reset the clock is not permitted to app users.
- The editor shows the next eligible date/time and unlocks at the boundary. Username uniqueness and email-based sign-in are unchanged.

## Admin lookup
The following exact lookup is callable only as a database administrator or service role, never from the browser:

```sql
select * from public.lookup_cova_account('lino');
select * from public.lookup_cova_account('@Lino');
select * from public.lookup_cova_account('person@example.com');
```

Results contain `user_id`, current auth `email`, and nullable `username`. Email is not copied into profile metadata, so an auth email change cannot leave stale lookup data. Accounts without a username remain findable by email. No user can use this function to enumerate another account's email.

## Release order and QA
Apply `supabase/migrations/20260920010000_user_profiles.sql` **before** publishing the UI. Verify the live constraints, RLS, function ACL, and owner/duplicate cases; record the receipt outside the repository without credentials. Do not deploy the UI if the migration cannot be applied.

`npm run test:profile` runs rules, real PostgreSQL/PGlite migration checks, repository guards, and browser interactions. Browser fixtures are explicitly synthetic and are not production proof. After a production deployment, verify persistence across reload, duplicate rejection between disposable users, privileged username/email lookup, private read/write denial, and responsive UI. Never overwrite a real user's chosen username/photo merely for QA.
