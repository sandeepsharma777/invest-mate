const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Firebase Auth onCreate Trigger
 * Sets custom user claim: { role: 'authenticated' } on every new user.
 * 
 * Why this is required:
 * Supabase PostgREST uses the JWT's `role` claim to assign the Postgres role.
 * Firebase Auth ID tokens don't include `role: 'authenticated'` by default.
 * Adding this custom claim allows Supabase to authorize the request under Postgres role 'authenticated',
 * which activates Row Level Security (RLS) policies for authenticated users.
 */
exports.setCustomClaimsOnCreate = functions.auth.user().onCreate(async (user) => {
  try {
    // Set custom claim { role: 'authenticated' }
    await admin.auth().setCustomUserClaims(user.uid, {
      role: "authenticated",
    });
    console.log(`[Auth Trigger] Successfully attached { role: 'authenticated' } to UID: ${user.uid}`);
  } catch (error) {
    console.error(`[Auth Trigger] Failed to set custom claims for UID: ${user.uid}:`, error);
  }
});

/**
 * Optional HTTP utility endpoint to backfill custom claims on existing users
 */
exports.backfillUserRole = functions.https.onCall(async (data, context) => {
  // Ensure the caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be authenticated to backfill claims.");
  }

  const uid = context.auth.uid;
  await admin.auth().setCustomUserClaims(uid, {
    role: "authenticated",
  });

  return { success: true, uid, role: "authenticated" };
});
