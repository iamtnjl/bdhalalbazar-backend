import { adminMessaging } from "../config/firebase";


export async function sendPushNotification(tokens, message) {
  if (!tokens.length) return;

  const payload = {
    notification: {
      title: "BDHalalBazar",
      body: message,
    },
  };

  await adminMessaging.sendEachForMulticast({
    tokens,
    ...payload,
  });
}
