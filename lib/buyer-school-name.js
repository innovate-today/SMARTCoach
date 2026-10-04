const crypto = require("crypto");
const { validBuyerIdentity } = require("./new-buyer-policy");

function reject(message) {
  throw Object.assign(new Error(message), { statusCode: 409 });
}

async function ensureBuyerSchoolName(deps, buyer, evidence, options = {}) {
  const { companyId, readLocation, writeName, load, save } = deps;
  const now = deps.now || Date.now;
  if (!validBuyerIdentity(buyer) || evidence.accountKey !== buyer.accountKey
    || evidence.locationId !== buyer.locationId || evidence.purchaseVerified !== true
    || evidence.pendingCheckoutMatched !== true) reject("School name buyer evidence is not verified.");
  const name = evidence.schoolName;
  const coach = evidence.coachName;
  if (typeof name !== "string" || !name.trim() || name !== name.trim() || name.length > 140
    || typeof coach !== "string" || !coach.trim() || !companyId
    || typeof evidence.checkoutFingerprint !== "string" || !evidence.checkoutFingerprint
    || typeof evidence.ownerEmail !== "string" || !evidence.ownerEmail
    || typeof evidence.subscriptionId !== "string" || !evidence.subscriptionId) {
    reject("School name identity evidence is incomplete.");
  }
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify([
    buyer.accountKey, buyer.locationId, companyId, name, coach, evidence.ownerEmail,
    evidence.subscriptionId, evidence.checkoutFingerprint,
  ])).digest("hex");
  const previous = await load();
  if (previous && (previous.fingerprint !== fingerprint || previous.locationId !== buyer.locationId
    || previous.buyerAccountKey !== buyer.accountKey || previous.companyId !== companyId)) {
    reject("School name history conflicts with the buyer.");
  }
  if (options.reviewReadback !== true && previous && previous.status !== "confirmed") reject("School name write was already attempted. Review its outcome before retrying.");
  const verifyLocation = location => {
    if (!location || location.id !== buyer.locationId || location.companyId !== companyId
      || typeof location.name !== "string" || !location.name.trim()
      || location.email && location.email.trim().toLowerCase() !== evidence.ownerEmail.trim().toLowerCase()) {
      reject("School name location identity does not match.");
    }
  };
  const location = await readLocation();
  verifyLocation(location);
  if (options.reviewReadback === true) {
    if (!previous || previous.status !== "attempted" || previous.schoolName !== name
      || !Number.isFinite(previous.attemptedAt) || location.name !== name) {
      reject("School name review requires an attempted write and exact current provider name. No write repeated.");
    }
    const reviewFingerprint = crypto.createHash("sha256").update(JSON.stringify([previous, fingerprint,
      location.id, location.companyId, location.name, location.email || ""])).digest("hex");
    const preview = { ...buyer, fingerprint: reviewFingerprint, schoolName: name,
      readbackVerified: true, providerWritePerformed: false, accountUnchanged: true, emailSent: false };
    if (options.dryRun !== false) return preview;
    if (options.confirmReadback !== true || options.expectedFingerprint !== reviewFingerprint) {
      reject("Explicit unchanged-evidence school name confirmation is required.");
    }
    const complete = { ...previous, status: "confirmed", confirmedAt: now(),
      confirmationSource: "reviewed_provider_readback" };
    await save(complete);
    const confirmed = await load();
    // The registry refreshes updatedAt on every save; all other saved fields must match.
    if (!confirmed || Object.keys(complete).filter(key => key !== "updatedAt")
      .some(key => JSON.stringify(confirmed[key]) !== JSON.stringify(complete[key]))) {
      reject("Reviewed school name confirmation readback failed. Do not repeat recovery.");
    }
    return { ...preview, ledgerConfirmed: true, accountUnchanged: true };
  }
  if (previous) {
    if (location.name !== name) reject("Confirmed school name has changed. Preserve it for review.");
    return { confirmed: true, alreadyConfirmed: true };
  }
  if (location.name === name) return { confirmed: true, alreadyNamed: true };
  const fallback = `${coach.trim()}'s Account`;
  if (location.name.trim().toLowerCase() !== fallback.toLowerCase()) {
    return { confirmed: true, customNamePreserved: true };
  }
  const intent = { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, companyId,
    fingerprint, beforeName: location.name, schoolName: name, status: "attempted", attemptedAt: now() };
  await save(intent);
  const saved = await load();
  if (!saved || Object.keys(intent).some(key => saved[key] !== intent[key])) reject("School name intent readback failed.");
  const fresh = await readLocation();
  verifyLocation(fresh);
  if (fresh.name !== location.name) reject("Location name changed before the school name update.");
  let writeError;
  try { await writeName(name); } catch (error) { writeError = error; }
  // A failed response may follow an applied write. Confirm independently, never repeat the PUT.
  const readback = await readLocation();
  verifyLocation(readback);
  if (readback.name !== name) {
    if (writeError) throw writeError;
    reject("School name provider readback failed. Review required.");
  }
  const complete = { ...intent, status: "confirmed", confirmedAt: now(),
    ...(writeError ? { writeResponseUncertain: true } : {}) };
  await save(complete);
  const confirmed = await load();
  if (!confirmed || Object.keys(complete).some(key => confirmed[key] !== complete[key])) reject("School name completion readback failed.");
  return { confirmed: true, nameUpdated: true };
}

module.exports = { ensureBuyerSchoolName };
