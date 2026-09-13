function clean(value) {
  if (value && typeof value === "object") return clean(value.value || value.name || value.label || value.fullName || value.contactName || value.id);
  return String(value || "").replace(/\s+/g, " ").trim();
}

function displayNameCase(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split(" ").map(displayNamePart).join(" ");
}

function displayNamePart(part) {
  return part.split("-").map((piece) => piece.split("'").map(displayNameSegment).join("'")).join("-");
}

function displayNameSegment(segment) {
  if (!segment) return segment;
  if (segment !== segment.toLowerCase() && segment !== segment.toUpperCase()) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

module.exports = {
  displayNameCase,
};
