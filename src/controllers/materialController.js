const Material = require("../models/materialModel");
const paginate = require("../utils/pagination");

const createMaterial = async (req, res) => {
  try {
    const { name } = req.body;
    const material = new Material({ name });
    await material.save();
    res.status(201).json(material);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllMaterials = async (req, res) => {
  try {
    let filter = {};

    if (req.query.slugs) {
      const slugsArray = req.query.slugs.split(",").map((slug) => slug.trim());
      filter = { slug: { $in: slugsArray } };
    }

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

    const paginatedData = await paginate(Material, filter, req);
    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = { createMaterial, getAllMaterials };
