const assert = require("assert/strict");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("onboarding.html", "utf8");
assert.match(html, /label for="ghlLocationCreateReviewLocationId">HighLevel Location ID for event review/);
assert.match(html, /id="cleanupLocationId"/);

const source = html.slice(html.indexOf("async function reviewUnmatchedGhlLocationCreate(){"), html.indexOf("async function previewHighLevelFulfillment(){"));
const elements = {
  ghlOAuthLocationEventReviewBtn: { disabled: false },
  ghlLocationCreateReviewLocationId: { value: "AbCdEfGhIjKlMnOpQrSt" },
  locationId: { value: "different-connection-id" },
};
const requests = [];
let status = "";
const context = vm.createContext({
  document: { getElementById: id => elements[id] },
  activeAutomationSecret: () => "test-secret",
  setStatus: message => { status = message; },
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ success: true, found: false }) };
  },
});

(async () => {
  vm.runInContext(source, context);
  await context.reviewUnmatchedGhlLocationCreate();
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /locationId=AbCdEfGhIjKlMnOpQrSt/);
  assert.equal(elements.ghlOAuthLocationEventReviewBtn.disabled, false);
  assert.match(status, /No unmatched HighLevel location event is saved/);
  console.log("Unmatched LocationCreate review uses its dedicated Location ID field.");
})().catch(error => { console.error(error); process.exitCode = 1; });
