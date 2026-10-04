const crypto = require("crypto");
const { validBuyerIdentity } = require("./new-buyer-policy");

function reject(message) {
  throw Object.assign(new Error(message), { statusCode: 409 });
}

async function ensureBuyerSchoolName(deps, buyer, evidence) {
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
  if (previous && previous.status !== "confirmed") reject("School name write was already attempted. Review its outcome before retrying.");
  const verifyLocation = location => {
    if (!location || location.id !== buyer.locationId || location.companyId !== companyId
      || typeof location.name !== "string" || !location.name.trim()
      || location.email && location.email.trim().toLowerCase() !== evidence.ownerEmail.trim().toLowerCase()) {
      reject("School name location identity does not match.");
    }
  };
  const location = await readLocation();
  verifyLocation(location);
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
  await writeName(name);
  const readback = await readLocation();
  verifyLocation(readback);
  if (readback.name !== name) reject("School name provider readback failed. Review required.");
  const complete = { ...intent, status: "confirmed", confirmedAt: now() };
  await save(complete);
  const confirmed = await load();
  if (!confirmed || Object.keys(complete).some(key => confirmed[key] !== complete[key])) reject("School name completion readback failed.");
  return { confirmed: true, nameUpdated: true };
}

module.exports = { ensureBuyerSchoolName };
