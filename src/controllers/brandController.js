const Brand = require("../models/BrandModel");
const paginate = require("../utils/pagination");

const createBrand = async (req, res) => {
  try {
    const { name } = req.body;
    const brand = new Brand({ name });
    await brand.save();
    res.status(201).json(brand);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllBrands = async (req, res) => {
  try {
    const paginatedData = await paginate(Brand, {}, req);
    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = { createBrand, getAllBrands };
