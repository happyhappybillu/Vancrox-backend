const PushSubscription = require("../models/PushSubscription");
const webpush = require("web-push");

// Set VAPID keys — generate once with: npx web-push generate-vapid-keys
// Then put them in .env
webpush.setVapidDetails(
  "mailto:support@vancrox.tech",
  process.env.VAPID_PUBLIC_KEY || "BHsQn1Wc_u9MbraLjHlIChtLzq50AfFhzlnhS2XoqzyMV6jS53hWs9BRdsIsxVmd82XFQy28kgB8D54WzXgHlAo",
  process.env.VAPID_PRIVATE_KEY || "your_vapid_private_key_here"
);

/**
 * Send push notification to a specific user
 * @param {ObjectId} userId
 * @param {string} title
 * @param {string} body
 * @param {string} type  — trade_live | trade_complete | general
 */
async function sendPushToUser(userId, title, body, type = "general") {
  try {
    const subs = await PushSubscription.find({ userId }).lean();
    if (!subs.length) return;

    const payload = JSON.stringify({ title, body, tag: type, url: "/investor" });

    for (const sub of subs) {
      try {
        const parsed = JSON.parse(sub.subscription);
        await webpush.sendNotification(parsed, payload);
      } catch (err) {
        // Remove expired/invalid subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.findByIdAndDelete(sub._id);
        }
      }
    }
  } catch (e) {
    console.error("sendPushToUser error:", e.message);
  }
}

module.exports = { sendPushToUser };
