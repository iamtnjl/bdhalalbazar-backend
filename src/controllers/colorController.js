const Color = require("../models/colorModel");
const paginate = require("../utils/pagination");

const createColor = async (req, res) => {
  try {
    const { name } = req.body;
    const color = new Color({ name });
    await color.save();
    res.status(201).json(color);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllColors = async (req, res) => {
  try {
    let filter = {};

    if (req.query.slugs) {
      const slugsArray = req.query.slugs.split(",").map((slug) => slug.trim());
      filter = { slug: { $in: slugsArray } };
    }

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" }; 
    }

    const paginatedData = await paginate(Color, filter, req);
    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = { createColor, getAllColors };
