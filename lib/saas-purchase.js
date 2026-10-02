const { PLAN_DEFINITIONS, suggestedSubscriptionAmount } = require("./smartcoach-plans");

function verifySaasCatalogPurchase(subscription, catalog, companyId, sellerLocationId) {
  const failed = (reason) => ({ purchaseVerified: false, reason });
  if (!catalog || Array.isArray(catalog) || catalog.planId !== subscription.saasPlanId
    || catalog.companyId !== companyId || catalog.providerLocationId !== sellerLocationId
    || catalog.productId !== subscription.productId || catalog.isSaaSV2 !== true) {
    return failed("SaaS plan identity, seller or product did not match the buyer subscription.");
  }
  const plan = Object.values(PLAN_DEFINITIONS).find((item) => item.pro && item.key !== "proUnlimited" && item.label === catalog.title);
  if (!plan) return failed("SaaS plan title is not an exact supported SMARTCoach checkout tier.");
  const prices = Array.isArray(catalog.prices) ? catalog.prices.filter((price) => price && price.id === subscription.priceId) : [];
  if (prices.length !== 1 || prices[0].active !== true) return failed("Subscription price is missing, duplicated or inactive in its SaaS plan.");
  const price = prices[0];
  const cadence = price.billingInterval === "month" ? "monthly" : price.billingInterval === "year" ? "annual" : "";
  const amount = Number(price.amount);
  if (!cadence || price.currency !== "USD" || !Number.isFinite(amount) || amount <= 0
    || !["number", "string"].includes(typeof price.amount)
    || amount !== Number(suggestedSubscriptionAmount(plan.key, cadence))) {
    return failed("SaaS price currency, interval or amount does not match SMARTCoach checkout pricing.");
  }
  if (!Number.isInteger(catalog.trialPeriod) || catalog.trialPeriod < 0 || catalog.trialPeriod > 365) {
    return failed("SaaS plan trial period could not be verified.");
  }
  return { purchaseVerified: true, purchasedProductPlan: plan.key, purchasedProductName: plan.label,
    purchasedBillingCadence: cadence, purchasedAmount: amount.toFixed(2), purchasedCurrency: "USD",
    planTrialDays: catalog.trialPeriod, activeAthleteLimit: plan.activeAthleteLimit };
}

module.exports = { verifySaasCatalogPurchase };
