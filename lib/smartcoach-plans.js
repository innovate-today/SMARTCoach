const PLAN_DEFINITIONS = {
  essential: {
    key: "essential",
    label: "SMARTCoach Essential",
    activeAthleteLimit: 0,
    monthlyAmount: "10.00",
    annualAmount: "100.00",
    coachSeatLimit: 1,
    pro: false,
  },
  pro25: {
    key: "pro25",
    label: "SMARTCoach Pro 25",
    activeAthleteLimit: 25,
    monthlyAmount: "19.00",
    annualAmount: "199.00",
    coachSeatLimit: 10,
    pro: true,
  },
  pro100: {
    key: "pro100",
    label: "SMARTCoach Pro 100",
    activeAthleteLimit: 100,
    monthlyAmount: "29.00",
    annualAmount: "299.00",
    coachSeatLimit: 10,
    pro: true,
  },
  pro200: {
    key: "pro200",
    label: "SMARTCoach Pro 200",
    activeAthleteLimit: 200,
    monthlyAmount: "39.00",
    annualAmount: "399.00",
    coachSeatLimit: 10,
    pro: true,
  },
  proUnlimited: {
    key: "proUnlimited",
    label: "SMARTCoach Pro Unlimited",
    activeAthleteLimit: null,
    monthlyAmount: "Custom",
    annualAmount: "Custom",
    coachSeatLimit: 10,
    pro: true,
  },
};

function normalizeProductPlan(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!raw) return "pro25";
  if (raw === "essential" || raw === "smartcoach essential" || raw === "smartcoach pro essential") return "essential";
  if (raw === "pro 100" || raw === "smartcoach pro 100" || raw === "100" || raw === "pro100") return "pro100";
  if (raw === "pro 200" || raw === "smartcoach pro 200" || raw === "200" || raw === "pro200") return "pro200";
  if (raw === "pro unlimited" || raw === "smartcoach pro unlimited" || raw === "unlimited" || raw === "custom" || raw === "pro unlimited custom" || raw === "pro custom" || raw === "prounlimited") return "proUnlimited";
  if (raw === "pro 25" || raw === "smartcoach pro 25" || raw === "25" || raw === "pro25") return "pro25";
  if (raw === "pro" || raw === "smartcoach pro") return "pro25";
  return "pro25";
}

function planDefinition(value) {
  return PLAN_DEFINITIONS[normalizeProductPlan(value)] || PLAN_DEFINITIONS.pro25;
}

function isProPlan(value) {
  return !!planDefinition(value).pro;
}

function activeAthleteLimit(value) {
  return planDefinition(value).activeAthleteLimit;
}

function coachSeatLimit(value) {
  return planDefinition(value).coachSeatLimit;
}

function suggestedSubscriptionAmount(productPlan, cadence) {
  const plan = planDefinition(productPlan);
  return String(cadence || "").trim().toLowerCase() === "annual" ? plan.annualAmount : plan.monthlyAmount;
}

module.exports = {
  PLAN_DEFINITIONS,
  normalizeProductPlan,
  planDefinition,
  isProPlan,
  activeAthleteLimit,
  coachSeatLimit,
  suggestedSubscriptionAmount,
};
