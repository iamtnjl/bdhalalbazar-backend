const Settings = require("../models/settingsModel");

// GET Singleton Settings
const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({
        delivery_charge: 0,
        platform_fee: 0,
        profit_margin: 0,
        banner_image: {},
        banner_images: [],
      });
    }

    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
const updateSettings = async (req, res) => {
  try {
    const {
      delivery_charge,
      platform_fee,
      profit_margin,
      banner_image,
      banner_images,
    } = req.body;

    let settings = await Settings.findOne();

    if (!settings) {
      // Create settings if not exists
      settings = new Settings({
        delivery_charge,
        platform_fee,
        profit_margin,
        banner_image,
        banner_images,
      });
    } else {
      // Update existing settings
      settings.delivery_charge = delivery_charge ?? settings.delivery_charge;
      settings.platform_fee = platform_fee ?? settings.platform_fee;
      settings.profit_margin = profit_margin ?? settings.profit_margin;
      settings.banner_images = banner_images ?? settings.banner_images;
    }

    const savedSettings = await settings.save();
    res.json(savedSettings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getSettings, updateSettings };
