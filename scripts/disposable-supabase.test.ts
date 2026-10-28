import { describe, expect, it } from "vitest";
import { validateResetUrls } from "./disposable-supabase.mjs";
const env={ALLOW_TEST_DATABASE_MUTATIONS:"true",TEST_DATABASE_CONFIRMED_NON_PRODUCTION:"true",ALLOW_TEST_DATABASE_RESET:"true",SUPABASE_TEST_WORKDIR:"explicit",DATABASE_URL:"postgresql://test@127.0.0.1:56432/postgres",DIRECT_URL:"postgresql://test@127.0.0.1:56432/postgres",TEST_DATABASE_URL:"postgresql://test@127.0.0.1:56432/postgres"};
describe("destructive migration target guard",()=>{
  it("requires all independent reset authorizations and explicit workdir",()=>{
    for(const key of ["ALLOW_TEST_DATABASE_MUTATIONS","TEST_DATABASE_CONFIRMED_NON_PRODUCTION","ALLOW_TEST_DATABASE_RESET","SUPABASE_TEST_WORKDIR"]) expect(()=>validateResetUrls({...env,[key]:undefined})).toThrow();
  });
  it("rejects remote or inconsistent URLs before any reset",()=>{
    expect(()=>validateResetUrls({...env,DIRECT_URL:"postgresql://test@127.0.0.1:65432/postgres"})).toThrow();
    expect(()=>validateResetUrls({...env,DATABASE_URL:"postgresql://test@db.example.test/postgres"})).toThrow();
    expect(()=>validateResetUrls(env)).not.toThrow();
  });
});
