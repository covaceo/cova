import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration='supabase/migrations/20260920020000_username_change_cooldown.sql';
assert.ok(existsSync(migration),'Database must enforce the 14-day username cooldown');
const db=new PGlite();
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const cooldown=e=>e.code==='P0001'&&e.message==='username_change_cooldown';
try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${A}','a@example.test'),('${B}','b@example.test');`);
 await db.exec(readFileSync('supabase/migrations/20260920010000_user_profiles.sql','utf8'));
 await db.query('insert into public.user_profiles(user_id,username) values($1,$2)',[A,'existing']);
 await db.exec(readFileSync(migration,'utf8'));
 const existing=(await db.query('select username_changed_at from public.user_profiles where user_id=$1',[A])).rows[0].username_changed_at;
 assert.ok(existing,'Existing profiles receive a server timestamp');
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${A}',false)`);
 await assert.rejects(db.query("update public.user_profiles set username='renamed' where user_id=$1",[A]),cooldown);
 await assert.rejects(db.query("insert into public.user_profiles(user_id,username) values($1,'renamed') on conflict(user_id) do update set username=excluded.username",[A]),cooldown);
 await db.query("update public.user_profiles set username_changed_at='2000-01-01',avatar_data='data:image/jpeg;base64,/9j/2Q==' where user_id=$1",[A]);
 assert.deepEqual((await db.query('select username_changed_at from public.user_profiles')).rows[0].username_changed_at,existing,'Photo and forged timestamp writes cannot reset the cooldown');
 await db.query("insert into public.user_profiles(user_id,username,avatar_data,username_changed_at) values($1,'existing',null,'2000-01-01') on conflict(user_id) do update set username=excluded.username,avatar_data=excluded.avatar_data,username_changed_at=excluded.username_changed_at",[A]);
 assert.deepEqual((await db.query('select username_changed_at from public.user_profiles')).rows[0].username_changed_at,existing,'Same-name photo upsert preserves original timestamp');
 await assert.rejects(db.query('delete from public.user_profiles where user_id=$1',[A]),/permission denied/);
 await db.exec(`select set_config('request.jwt.claim.sub','${B}',false)`);
 await db.query("insert into public.user_profiles(user_id,username,username_changed_at) values($1,'new_user','2000-01-01')",[B]);
 assert.ok(new Date((await db.query('select username_changed_at from public.user_profiles')).rows[0].username_changed_at).getTime()>Date.parse('2026-01-01'),'Creation timestamp cannot be backdated');
 await assert.rejects(db.query("update public.user_profiles set username='again' where user_id=$1",[B]),cooldown);
 assert.equal((await db.query('select * from public.user_profiles where user_id=$1',[A])).rows.length,0);
 // Fixture clock placement by the database owner only. Production clients cannot disable triggers.
 await db.exec(`reset role;alter table public.user_profiles disable trigger user_profiles_username_cooldown;update public.user_profiles set username_changed_at=clock_timestamp()-interval '336 hours'+interval '1 minute' where user_id='${A}';alter table public.user_profiles enable trigger user_profiles_username_cooldown;set role authenticated;select set_config('request.jwt.claim.sub','${A}',false)`);
 await assert.rejects(db.query("update public.user_profiles set username='too_soon' where user_id=$1",[A]),cooldown);
 await db.exec(`reset role;alter table public.user_profiles disable trigger user_profiles_username_cooldown;update public.user_profiles set username_changed_at=clock_timestamp()-interval '336 hours' where user_id='${A}';alter table public.user_profiles enable trigger user_profiles_username_cooldown;set role authenticated;`);
 await assert.rejects(db.query("update public.user_profiles set username='new_user' where user_id=$1",[A]),e=>e.code==='23505');
 await db.query("update public.user_profiles set username='allowed' where user_id=$1",[A]);
 await assert.rejects(db.query("update public.user_profiles set username='again' where user_id=$1",[A]),cooldown);
 assert.equal((await db.query('select username from public.user_profiles')).rows[0].username,'allowed');
 console.log('PASS PostgreSQL cooldown: 336-hour boundary, direct update/upsert enforcement, timestamp forgery, no-op/photo updates, uniqueness, RLS and delete bypass');
} finally {await db.close();}
