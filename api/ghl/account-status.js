const { getGhlContext } = require("./account");

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accountKey, token, locationId } = getGhlContext(req);

  res.status(token && locationId ? 200 : 404).json({
    success: !!(token && locationId),
    accountKey,
    configured: !!(token && locationId),
    error: token && locationId ? undefined : `SMARTCoach account "${accountKey}" is not configured.`,
  });
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account");
}
