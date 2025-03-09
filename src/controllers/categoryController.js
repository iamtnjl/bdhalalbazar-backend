const Category = require("../models/categoryModel");
const paginate = require("../utils/pagination");

const createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const category = new Category({ name });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllCategories = async (req, res) => {
  try {
    let filter = {};

    if (req.query.slugs) {
      const slugsArray = req.query.slugs.split(",").map((slug) => slug.trim());
      filter = { slug: { $in: slugsArray } };
    }

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" }; 
    }

    const paginatedData = await paginate(Category, filter, req);
    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
module.exports = { createCategory, getAllCategories };
