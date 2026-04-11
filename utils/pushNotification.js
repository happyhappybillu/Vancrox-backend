const PushSubscription = require("../models/PushSubscription");
const webpush = require("web-push");

webpush.setVapidDetails(
  "mailto:support@vancrox.tech",
  process.env.VAPID_PUBLIC_KEY  || "BHsQn1Wc_u9MbraLjHlIChtLzq50AfFhzlnhS2XoqzyMV6jS53hWs9BRdsIsxVmd82XFQy28kgB8D54WzXgHlAo",
  process.env.VAPID_PRIVATE_KEY || "j4FHP4PgX_EVqFEOrQzo28nokH3gxm2AtwP54KBx3r4"
);

async function sendPushToUser(userId, title, body, type) {
  try {
    const subs = await PushSubscription.find({ userId }).lean();
    if (!subs.length) return;
    const payload = JSON.stringify({
      title: title,
      body: body,
      tag: type || "general",
      url: "/investor"
    });
    for (const sub of subs) {
      try {
        const parsed = JSON.parse(sub.subscription);
        await webpush.sendNotification(parsed, payload);
        console.log("✅ Push sent to user:", userId);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.findByIdAndDelete(sub._id);
        } else {
          console.log("Push send fail:", err.message);
        }
      }
    }
  } catch (e) {
    console.error("sendPushToUser error:", e.message);
  }
}

module.exports = { sendPushToUser };
