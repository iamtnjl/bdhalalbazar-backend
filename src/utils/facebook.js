const bizSdk = require("facebook-nodejs-business-sdk");
const crypto = require("crypto");

const { EventRequest, CustomData, UserData, ServerEvent } = bizSdk;
const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
const pixelId = process.env.FACEBOOK_PIXEL_ID;
const testEventCode = process.env.FACEBOOK_TEST_EVENT_CODE;

const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");

async function sendFacebookEvent({
  eventName,
  email,
  phone,
  fbp,
  fbc,
  value,
  currency = "USD",
  client_ip,
  user_agent,
}) {
  const userData = new UserData()
    .setEmail(email ? hash(email.toLowerCase()) : undefined)
    .setPhone(phone ? hash(phone) : undefined)
    .setFbp(fbp)
    .setFbc(fbc)
    .setClientIpAddress(client_ip)
    .setClientUserAgent(user_agent);

  const customData = new CustomData().setCurrency(currency).setValue(value);

  const serverEvent = new ServerEvent()
    .setEventName(eventName)
    .setEventTime(Math.floor(Date.now() / 1000))
    .setUserData(userData)
    .setCustomData(customData)
    .setActionSource("website");

  const eventsData = [serverEvent];
  const eventRequest = new EventRequest(accessToken, pixelId).setEvents(
    eventsData
  );

  if (testEventCode) {
    eventRequest.setTestEventCode(testEventCode);
  }

  return await eventRequest.execute();
}

module.exports = { sendFacebookEvent };
