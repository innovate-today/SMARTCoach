const crypto = require("crypto");
const { accountAccessAllowed, normalizeAccountAccess } = require("./ghl-account");
const { PLAN_DEFINITIONS } = require("./smartcoach-plans");
const SELLER = "QxwjWekSyUf7sDOFHPB4";
const SUPPORTED_PLANS = ["pro25", "pro100", "pro200"];

function enabledPlans(value) {
  if (typeof value !== "string") return [];
  const plans = value.split(",").map(plan => plan.trim());
  return plans.length && plans.every(plan => SUPPORTED_PLANS.includes(plan))
    && new Set(plans).size === plans.length ? plans : [];
}

function newBuyerPolicyEnabled(env = {}, plan) {
  const execution = enabledPlans(env.SMARTCOACH_GHL_NEW_BUYER_PLANS);
  const oauth = enabledPlans(env.SMARTCOACH_GHL_NEW_BUYER_OAUTH_PLANS);
  return plan === undefined ? execution.some(key => oauth.includes(key))
    : execution.includes(plan) && oauth.includes(plan);
}

function isSupportedNewBuyerPlan(plan) {
  return SUPPORTED_PLANS.includes(plan);
}

function checkoutTerms(plan, cadence) {
  if (!SUPPORTED_PLANS.includes(plan) || !["monthly", "annual"].includes(cadence)) return null;
  const definition = PLAN_DEFINITIONS[plan];
  return { product: `${definition.label} - ${cadence === "monthly" ? "Monthly" : "Annual"}`,
    amount: cadence === "monthly" ? definition.monthlyAmount : definition.annualAmount };
}

function validBuyerIdentity(buyer) {
  return typeof buyer?.locationId === "string" && /^[A-Za-z0-9]{20}$/.test(buyer.locationId)
    && buyer.locationId !== SELLER && buyer.accountKey === `sc-${buyer.locationId.toLowerCase()}`;
}

function canWaitForSubscriptionIdentity({ env, buyer, account, pending, companyId, inventory }) {
  const email = String(account?.accountOwnerEmail || "").trim().toLowerCase();
  const plan = account?.productPlan;
  const product = checkoutTerms(plan, pending?.cadence)?.product;
  return validBuyerIdentity(buyer) && account?.accountKey === buyer.accountKey && account.locationId === buyer.locationId
    && newBuyerPolicyEnabled(env, plan) && account.subscription?.status === "incomplete"
    && !String(account.token || "").trim() && Array.isArray(account.coachStaff || []) && !(account.coachStaff || []).length
    && Array.isArray(account.coachAccessCodes || []) && !(account.coachAccessCodes || []).length && !account.accessCode
    && accountAccessAllowed(normalizeAccountAccess(account))
    && pending?.source === "smartcoach-precheckout" && pending.plan === plan && !!product && pending.productName === product
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && pending.coachEmail === email
    && pending.lastMatchedLocationId === buyer.locationId && pending.lastLocationCreateEvent?.id === buyer.locationId
    && !!companyId && pending.lastLocationCreateEvent.companyId === companyId
    && pending.lastLocationCreateEvent.email === email && pending.lastLocationCreateEvent.signatureVerified === true
    && !!pending.schoolName && account.schoolName === pending.schoolName
    && !!pending.coachName && account.accountOwnerName === pending.coachName
    && inventory?.complete === true && inventory.references?.length === 1 && inventory.references[0] === buyer.accountKey;
}

function qualifyNewBuyer({ env, buyer, account, pending, purchase, status, companyId, subscriptionId, priceId, inventory, previous }) {
  const cadence = purchase?.purchasedBillingCadence;
  const plan = account?.productPlan;
  const { product, amount } = checkoutTerms(plan, cadence) || {};
  const email = String(account?.accountOwnerEmail || "").trim().toLowerCase();
  const checks = {
    planEnabled: newBuyerPolicyEnabled(env, plan),
    buyerIdentity: validBuyerIdentity(buyer) && account?.accountKey === buyer.accountKey && account?.locationId === buyer.locationId,
    purchase: purchase?.purchaseVerified === true && purchase.purchasedProductPlan === plan
      && purchase.purchasedAmount === amount && !!product && ["active", "trialing"].includes(status)
      && typeof subscriptionId === "string" && !!subscriptionId && typeof priceId === "string" && !!priceId,
    checkout: pending?.source === "smartcoach-precheckout" && pending.plan === plan && pending.cadence === cadence
      && pending.productName === product && pending.coachEmail === email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      && pending.lastMatchedLocationId === buyer.locationId && pending.lastLocationCreateEvent?.id === buyer.locationId
      && pending.lastLocationCreateEvent?.companyId === companyId && !!companyId
      && pending.lastLocationCreateEvent?.email === email && pending.lastLocationCreateEvent?.signatureVerified === true,
    configuration: !!product && !String(account.token || "").trim() && account.schoolName === pending?.schoolName && !!pending?.schoolName
      && account.accountOwnerName === pending?.coachName && !!pending?.coachName,
    accountAccess: !!account && accountAccessAllowed(normalizeAccountAccess(account)),
    singleMapping: inventory?.complete === true && inventory.references?.length === 1 && inventory.references[0] === buyer.accountKey,
  };
  if (Object.values(checks).some(value => !value)) return { qualified: false, blockers: Object.keys(checks).filter(key => !checks[key]) };
  const identity = { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, companyId, ownerEmail: email,
    schoolName: pending.schoolName, coachName: pending.coachName, productPlan: plan, productName: product,
    billingCadence: cadence, amount, subscriptionId, priceId };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const preserved = previous?.fingerprint === fingerprint && ["approved", "complete"].includes(previous.status)
    && Object.entries(identity).every(([key, value]) => previous[key] === value) && previous.snapshotVerified === true;
  const fresh = !previous && account.subscription?.status === "incomplete" && !String(account.token || "").trim()
    && !(account.coachStaff || []).length && !(account.coachAccessCodes || []).length && !account.accessCode;
  if (!fresh && !preserved) return { qualified: false, blockers: ["existing_or_conflicting_setup"] };
  return { qualified: true, fingerprint, identity, previousPreserved: preserved };
}

function completedBuyerOAuthApproval(env, buyer, account, proof) {
  const identity = proof && Object.fromEntries(["buyerAccountKey", "locationId", "companyId", "ownerEmail", "schoolName", "coachName",
    "productPlan", "productName", "billingCadence", "amount", "subscriptionId", "priceId"].map(key => [key, proof[key]]));
  const { product, amount } = checkoutTerms(proof?.productPlan, proof?.billingCadence) || {};
  return newBuyerPolicyEnabled(env, proof?.productPlan) && validBuyerIdentity(buyer) && proof?.status === "complete" && proof.snapshotVerified === true
    && !!product && proof.productName === product && proof.amount === amount && !!proof.subscriptionId && !!proof.priceId
    && crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex") === proof.fingerprint
    && proof.buyerAccountKey === buyer.accountKey
    && proof.locationId === buyer.locationId && proof.companyId === env.SMARTCOACH_GHL_OAUTH_COMPANY_ID
    && account?.accountKey === buyer.accountKey && account.locationId === buyer.locationId
    && account.productPlan === proof.productPlan
    && account.accountOwnerEmail === proof.ownerEmail && account.schoolName === proof.schoolName
    && account.accountOwnerName === proof.coachName && account.subscription?.billingCadence === proof.billingCadence
    && Number(account.subscription?.amount) === Number(proof.amount)
    && accountAccessAllowed(normalizeAccountAccess(account));
}

module.exports = { newBuyerPolicyEnabled, isSupportedNewBuyerPlan, validBuyerIdentity, canWaitForSubscriptionIdentity, qualifyNewBuyer, completedBuyerOAuthApproval };
