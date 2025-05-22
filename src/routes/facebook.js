const express = require("express");
const router = express.Router();
const { sendFacebookEvent } = require("../utils/facebook");

router.post("/track", async (req, res) => {
  try {
    const { eventName } = req.body;

    const fbp = req.cookies?._fbp;
    const fbc = req.cookies?._fbc;
    const client_ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip;
    const user_agent = req.headers["user-agent"];

    const response = await sendFacebookEvent({
      eventName,
      fbp,
      fbc,
      client_ip,
      user_agent,
    });

    res.json({ success: true, response });
  } catch (err) {
    console.error(err.message || err);
    res.status(500).json({ error: "Failed to send Facebook event" });
  }
});

module.exports = router;
