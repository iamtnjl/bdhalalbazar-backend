const Tag = require("../models/tagsModel");
const paginate = require("../utils/pagination.js");

const createTag = async (req, res) => {
  try {
    const { name, margin } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Tag name is required." });
    }

    if (!margin) {
      return res.status(400).json({ error: "Tag margin is required." });
    }

    // Optional: validate margin is a valid number
    const marginNumber = Number(margin);
    if (isNaN(marginNumber) || marginNumber < 0) {
      return res
        .status(400)
        .json({ error: "Margin must be a valid non-negative number." });
    }

    const tag = new Tag({
      name: name.trim(),
      margin: marginNumber.toString(), // keep as string if you want
    });

    await tag.save();
    res.status(201).json(tag);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllTags = async (req, res) => {
  try {
    const filter = {};

    // Optional: search by name
    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

    // Get all tags matching filter
    const tags = await Tag.find(filter).sort({ createdAt: -1 });

    res.status(200).json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllTagOptions = async (req, res) => {
  try {
    const filter = {};

    if (req.query.search) {
      filter.name = { $regex: req.query.search, $options: "i" };
    }

    // Use your paginate helper — no populate needed for tags
    const paginatedData = await paginate(
      Tag,
      filter,
      req,
      [], // no populate paths
      { name: 1 } // sort by name ASC
    );

    // Map paginated docs to label/value
    paginatedData.results = paginatedData.results.map((tag) => ({
      name: tag.name,
      value: tag._id,
    }));

    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTagDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate Mongo ID
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid tag ID." });
    }

    const tag = await Tag.findById(id);

    if (!tag) {
      return res.status(404).json({ error: "Tag not found." });
    }

    res.status(200).json(tag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, margin } = req.body;

    // Validate ID
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid tag ID." });
    }

    // Find the existing tag
    const tag = await Tag.findById(id);
    if (!tag) {
      return res.status(404).json({ error: "Tag not found." });
    }

    // Validate margin if provided
    if (margin !== undefined) {
      const marginNumber = Number(margin);
      tag.margin = marginNumber.toString();
    }

    // Validate name if provided
    if (name) {
      tag.name = name.trim();
    }

    await tag.save();

    res.status(200).json(tag);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteTag = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate Mongo ID
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid tag ID." });
    }

    const tag = await Tag.findByIdAndDelete(id);

    if (!tag) {
      return res.status(404).json({ error: "Tag not found." });
    }

    res.status(200).json({ message: "Tag deleted successfully.", tag });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createTag,
  getAllTags,
  getTagDetails,
  updateTag,
  deleteTag,
  getAllTagOptions,
};
