import {
  handleApi,
  verifyPassword,
  hashPassword,
  SEED_USERS,
  SESSION_COOKIE,
  type ApiRequest,
} from "../server/api.ts";
import { checkDatabase } from "../db/index.ts";

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${description}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${description}`);
    if (detail !== undefined) console.error("    Detail:", detail);
  }
}

const call = (
  method: string,
  path: string,
  body?: unknown,
  cookies: Record<string, string> = {},
) => handleApi({ method, path, query: {}, body, cookies } as ApiRequest);

async function runRegressionTests() {
  console.log("\n=== 1. PASSWORD VERIFICATION UNIT TESTS ===");

  // Create hash for user A
  const passwordA = "AlphaSecure@2026";
  const hashA = hashPassword(passwordA);

  assert("Correct password verifies against its own hash", verifyPassword(passwordA, hashA) === true);
  assert("Wrong password fails against hash", verifyPassword("WrongPassword123!", hashA) === false);
  assert("Empty password fails", verifyPassword("", hashA) === false);
  assert("Malformed hash fails", verifyPassword(passwordA, "malformed_salt_only") === false);

  // CRITICAL REGRESSION: Verify every seed user password against a different user's hash
  console.log("\n=== 2. SEED PASSWORD BYPASS PREVENTION ===");
  const targetHash = hashPassword("SpecificTargetPassword@999!");

  for (const seed of SEED_USERS) {
    const bypassResult = verifyPassword(seed.password, targetHash);
    assert(
      `Seed password for '${seed.username}' fails against a different stored hash`,
      bypassResult === false
    );
  }

  console.log("\n=== 3. RESET-PASSWORD AUTHENTICATION GUARD ===");
  // Unauthenticated reset-password
  const unauthReset = await call("POST", "auth/reset-password", {
    username: "agent1",
    newPassword: "NewPass123456!",
  });
  assert(
    "Unauthenticated reset-password returns 403 Forbidden",
    unauthReset.status === 403,
    unauthReset.body
  );

  // Authenticate as a regular agent (non-admin)
  const agentLogin = await call("POST", "auth/login", {
    username: "agent1",
    password: "Agent1@2026!",
  });
  // If agent1 had mustChangePassword, they can log in
  const agentCookie = agentLogin.cookie ? { [SESSION_COOKIE]: agentLogin.cookie.value } : {};

  if (agentLogin.status === 200 && agentCookie[SESSION_COOKIE]) {
    const agentReset = await call(
      "POST",
      "auth/reset-password",
      { username: "admin", newPassword: "HackedAdminPass123!" },
      agentCookie
    );
    assert(
      "Non-admin (AGENT) user cannot reset password (returns 403)",
      agentReset.status === 403,
      agentReset.body
    );
  } else {
    // If agent1's password was changed in earlier tests, login with AgentPass!2026
    const agentLogin2 = await call("POST", "auth/login", {
      username: "agent1",
      password: "AgentPass!2026",
    });
    const agentCookie2 = agentLogin2.cookie ? { [SESSION_COOKIE]: agentLogin2.cookie.value } : {};
    const agentReset = await call(
      "POST",
      "auth/reset-password",
      { username: "admin", newPassword: "HackedAdminPass123!" },
      agentCookie2
    );
    assert(
      "Non-admin (AGENT) user cannot reset password (returns 403)",
      agentReset.status === 403,
      agentReset.body
    );
  }

  console.log("\n=== 4. CHANGE-PASSWORD CURRENT PASSWORD VERIFICATION ===");
  // Sign in as admin
  let adminLogin = await call("POST", "auth/login", { username: "admin", password: "Admin@2026!" });
  if (adminLogin.status !== 200) {
    adminLogin = await call("POST", "auth/login", { username: "admin", password: "Str0ngPass!2026" });
  }
  assert("Admin can sign in", adminLogin.status === 200);
  const adminCookie = { [SESSION_COOKIE]: adminLogin.cookie!.value };

  // Attempt change-password with wrong current password
  const wrongCurrentChange = await call(
    "POST",
    "auth/change-password",
    { currentPassword: "CompletelyWrongPassword!", newPassword: "NextPass!2026" },
    adminCookie
  );
  assert(
    "change-password rejects incorrect current password with 401",
    wrongCurrentChange.status === 401,
    wrongCurrentChange.body
  );

  // Attempt change-password with empty current password
  const emptyCurrentChange = await call(
    "POST",
    "auth/change-password",
    { currentPassword: "", newPassword: "NextPass!2026" },
    adminCookie
  );
  assert(
    "change-password rejects empty current password with 401",
    emptyCurrentChange.status === 401,
    emptyCurrentChange.body
  );

  console.log("\n=== 5. AI ROUTES SESSION & ROLE GUARD ===");
  // Unauthenticated call to AI route
  const unauthAiVoa = await call("POST", "ai/draft-voa", { touristName: "Test Tourist" });
  assert("Unauthenticated AI draft-voa call is rejected with 401", unauthAiVoa.status === 401, unauthAiVoa.body);

  const unauthAiOcr = await call("POST", "ai/ocr-passport", { imageBase64: "invalid_data" });
  assert("Unauthenticated AI ocr-passport call is rejected with 401", unauthAiOcr.status === 401, unauthAiOcr.body);

  console.log("\n=== 6. PASSPORT OCR ZERO-FABRICATION VERIFICATION ===");
  // Authenticated call with failed/empty scan
  const failedOcr = await call(
    "POST",
    "ai/ocr-passport",
    { imageBase64: "data:image/jpeg;base64,ZmFrZV9jb3JydXB0X2RhdGE=" },
    adminCookie
  );
  assert("Authenticated OCR on failed scan returns 200 with success: false", failedOcr.status === 200 && failedOcr.body?.success === false, failedOcr.body);
  assert("OCR extraction flag is false", failedOcr.body?.extracted === false);

  const ocrData = failedOcr.body?.data || {};
  assert("Passport number is EMPTY (no randomDocNo)", ocrData.passportNumber === "");
  assert("Nationality is EMPTY (no fake British)", ocrData.nationality === "");
  assert("Date of birth is EMPTY (no fake 1988-05-22)", ocrData.dateOfBirth === "" && ocrData.dob === "");
  assert("Full name is EMPTY", ocrData.fullName === "");
  assert("Medical notes is EMPTY (no fake clearance)", ocrData.medicalNotes === "");
  assert("Confidence score is 0 (not fake 98%)", ocrData.confidenceScore === 0);

  console.log("\n=== 7. CLOUD SQL DURABLE PERSISTENCE VERIFICATION ===");
  const dbHealth = await checkDatabase();
  assert("Cloud SQL is connected", dbHealth.connected === true);
  assert("Cloud SQL is persistent", dbHealth.isPersistent === true);
  assert("Storage is NOT temporary PGlite", dbHealth.isTemporary === false);
  assert(
    "Driver identifies Cloud SQL europe-west2",
    dbHealth.driver.includes("Cloud SQL") && dbHealth.driver.includes("europe-west2"),
    dbHealth.driver
  );

  console.log("\n=== 8. GOOGLE SIGN-IN REMOVAL & OWNER ACCESS CONTROL ===");
  // Google/Firebase login endpoint must be disabled
  const firebaseLoginDisabled = await call("POST", "auth/firebase-login", {});
  assert("Firebase Google login endpoint is disabled (returns 404)", firebaseLoginDisabled.status === 404, firebaseLoginDisabled.body);

  // Persistent Cloud SQL blocks default seed logins
  if (dbHealth.isPersistent) {
    const seedLoginAttempt = await call("POST", "auth/login", {
      username: "admin",
      password: "Admin@2026!",
    });
    assert(
      "Default seed login is blocked in persistent Cloud SQL",
      seedLoginAttempt.status === 401 && String(seedLoginAttempt.body?.error || "").includes("disabled in persistent operations"),
      seedLoginAttempt.body
    );
  }

  console.log(`\n===========================================`);
  console.log(`REGRESSION RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`===========================================\n`);

  process.exit(failed === 0 ? 0 : 1);
}

runRegressionTests().catch((err) => {
  console.error("Regression test error:", err);
  process.exit(1);
});
