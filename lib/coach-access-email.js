function coachAccessEmail(name, code, inviteUrl) {
  const lines = [
    "SMARTCoach Access", "", `Hi ${name},`, "", "Your personal SMARTCoach code is:", "", code, "",
    "SMARTCoach Phone App", "",
    "Use the stopwatch app on your phone to time workouts, record splits, manage training groups, and sync completed sessions into SMART Trak.", "",
    "Open this link on your phone:", "https://app.smartcoach-pro.com", "",
    "iPhone", "Open the link in Safari. It must be Safari, not Chrome.",
    "Tap the Share button at the bottom.", "Scroll down and tap Add to Home Screen.",
    "The SMARTCoach icon will appear on your home screen.", "",
    "Android", "Open the link in Chrome.", "Tap the menu in the top right.",
    "Tap Add to Home screen or Install app if it appears.", "Confirm by tapping Add or Install.", "",
    "Use this code when the app asks for your coach access code.", "",
    "Use this private link to open SMART Trak:", inviteUrl, "", "Access type: Full Access", "",
    "Keep this code private. If it stops working, ask the head coach to reset your personal coach code.",
  ];
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  return lines.map((line) => line.startsWith("https://app.smartcoach-pro.com")
    ? `<p><a href="${escape(line)}">${line === inviteUrl ? "Open SMART Trak Overview" : "SMARTCoach Phone App"}</a></p>`
    : `<p>${line ? escape(line) : "<br>"}</p>`).join("");
}

module.exports = { coachAccessEmail };
