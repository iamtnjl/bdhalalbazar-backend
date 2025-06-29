const Category = require("../models/categoryModel");
const SubCategory = require("../models/SubCategoryModel");
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
const createSubCategory = async (req, res) => {
  try {
    const { name, categorySlug } = req.body;

    // Check if categorySlug is provided
    if (!categorySlug) {
      return res.status(400).json({ error: "Category slug is required." });
    }

    // Find parent category by slug
    const parentCategory = await Category.findOne({ slug: categorySlug });

    if (!parentCategory) {
      return res.status(404).json({ error: "Parent category not found." });
    }

    // Create subcategory with reference to parent category
    const subCategory = new SubCategory({
      name,
      category: parentCategory._id,
    });

    await subCategory.save();
    res.status(201).json(subCategory);
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
const getAllSubCategories = async (req, res) => {
  try {
    let filter = {};

    // Filter by slugs if provided
    if (req.query.slugs) {
      const slugsArray = req.query.slugs.split(",").map((slug) => slug.trim());
      filter.slug = { $in: slugsArray };
    }

    // Filter by name if search query provided
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

    // Filter by parent category slug
    if (req.query.category) {
      const parentCategory = await Category.findOne({
        slug: req.query.category,
      }).select("_id");

      if (parentCategory) {
        filter.category = parentCategory._id;
      } else {
        return res.status(404).json({ error: "Parent category not found." });
      }
    }

    const paginatedData = await paginate(SubCategory, filter, req);
    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createCategory,
  createSubCategory,
  getAllCategories,
  getAllSubCategories,
};
