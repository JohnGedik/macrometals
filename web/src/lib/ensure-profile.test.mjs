import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { defaultExport: {} });
const { ensureProfile } = await import("./ensure-profile.ts");

function client(profileResult, rpcResult = { error: null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      return {
        select() { return this; },
        eq(column, value) { calls.push(["eq", column, value]); return this; },
        async maybeSingle() { return profileResult; },
      };
    },
    async rpc(name) { calls.push(["rpc", name]); return rpcResult; },
  };
}

test("existing profile is not recreated", async () => {
  const supabase = client({ data: { id: "user" }, error: null });
  assert.equal(await ensureProfile(supabase, "user"), true);
  assert.deepEqual(supabase.calls, [["from", "profiles"], ["eq", "id", "user"]]);
});

test("missing profile is created for the authenticated account", async () => {
  const supabase = client({ data: null, error: null });
  assert.equal(await ensureProfile(supabase, "user"), true);
  assert.deepEqual(supabase.calls.at(-1), ["rpc", "ensure_own_profile"]);
});

test("lookup and creation errors do not report success", async () => {
  const lookup = client({ data: null, error: { code: "lookup_error" } });
  const creation = client({ data: null, error: null }, { error: { code: "create_error" } });
  assert.equal(await ensureProfile(lookup, "user"), false);
  assert.equal(lookup.calls.some(([kind]) => kind === "rpc"), false);
  assert.equal(await ensureProfile(creation, "user"), false);
});
