const Product = require("../models/productModel");
const Brand = require("../models/BrandModel");
const Material = require("../models/materialModel");
const Category = require("../models/categoryModel");
const Color = require("../models/colorModel");
const paginate = require("../utils/pagination")

const createProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      discount,
      brand,
      materials,
      categories,
      colors,
      primary_image,
      images,
      status,
      is_published,
      ad_pixel_id,
    } = req.body;

    // Validate if primary_image is provided
    if (!primary_image) {
      return res.status(400).json({ error: "Primary image is required" });
    }

    // Fetch brand, category, and material IDs from slugs
    // const brandDocs = await Brand.find({ slug: { $in: brand } }).select("_id");
    const brandDocs = await Brand.find({
      slug: { $in: brand },
    }).select("_id");
    const categoryDocs = await Category.find({
      slug: { $in: categories },
    }).select("_id");
    const materialDocs = await Material.find({
      slug: { $in: materials },
    }).select("_id");
    const colorDocs = await Color.find({
      slug: { $in: colors },
    }).select("_id");

    // Validate if all provided slugs exist
    if (
      brandDocs.length !== brand.length ||
      categoryDocs.length !== categories.length ||
      materialDocs.length !== materials.length ||
      colorDocs.length !== colors.length
    ) {
      return res
        .status(400)
        .json({ error: "Invalid brand, category, or material slug(s)" });
    }

    // Initialize the image objects
    let primaryImage = {};
    let multipleImages = [];

    // Handle primary image upload (single image)
    if (req.files && req.files.primary_image) {
      const primaryImageUpload = await cloudinary.uploader.upload(
        req.files.primary_image[0].path,
        {
          folder: "product_images",
        }
      );

      // Generate other image sizes for primary image
      const thumbnail = await cloudinary.uploader.upload(
        req.files.primary_image[0].path,
        {
          folder: "product_images",
          transformation: [{ width: 150, height: 150, crop: "fill" }],
        }
      );

      const medium = await cloudinary.uploader.upload(
        req.files.primary_image[0].path,
        {
          folder: "product_images",
          transformation: [{ width: 600, height: 600, crop: "limit" }],
        }
      );

      primaryImage = {
        original: primaryImageUpload.secure_url,
        thumbnail: thumbnail.secure_url,
        medium: medium.secure_url,
      };
    }

    // Handle multiple images upload
    if (req.files && req.files.images) {
      for (let i = 0; i < req.files.images.length; i++) {
        const imageUpload = await cloudinary.uploader.upload(
          req.files.images[i].path,
          {
            folder: "product_images",
          }
        );

        // Generate other image sizes for each image
        const thumbnail = await cloudinary.uploader.upload(
          req.files.images[i].path,
          {
            folder: "product_images",
            transformation: [{ width: 150, height: 150, crop: "fill" }],
          }
        );

        const medium = await cloudinary.uploader.upload(
          req.files.images[i].path,
          {
            folder: "product_images",
            transformation: [{ width: 600, height: 600, crop: "limit" }],
          }
        );

        multipleImages.push({
          original: imageUpload.secure_url,
          thumbnail: thumbnail.secure_url,
          medium: medium.secure_url,
        });
      }
    }

    const product = new Product({
      name,
      price,
      discount,
      brand: brandDocs.map((b) => b._id),
      materials: materialDocs.map((m) => m._id),
      categories: categoryDocs.map((c) => c._id),
      colors: colorDocs.map((c) => c._id),
      primary_image: primaryImage,
      images: multipleImages,
      status,
      is_published,
      ad_pixel_id,
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    let query = {};

    // Search by name
    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: "i" }; // Case-insensitive search
    }

    // Filtering by price range
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
    }

    // Filtering by brand, categories, materials, colors (expects comma-separated values)
    if (req.query.brand) query.brand = { $in: req.query.brand.split(",") };
    if (req.query.categories)
      query.categories = { $in: req.query.categories.split(",") };
    if (req.query.materials)
      query.materials = { $in: req.query.materials.split(",") };
    if (req.query.colors) query.colors = { $in: req.query.colors.split(",") };

    // Get paginated results with populated fields
    const paginatedData = await paginate(
      Product,
      query,
      req,
      ["brand", "materials", "categories", "colors"] // Populating necessary fields
    );

    // Add discount calculation to results
    const calculateDiscount = (product) => {
      return (product.price - (product.price * product.discount) / 100).toFixed(
        2
      );
    };

    paginatedData.results = paginatedData.results.map((product) => ({
      _id: product._id,
      name: product.name,
      price: product.price,
      discount: product.discount,
      discounted_price: calculateDiscount(product),
      brand: product.brand
        ? { name: product.brand.name, slug: product.brand.slug }
        : null,
      materials: product.materials.map((m) => ({ name: m.name, slug: m.slug })),
      categories: product.categories.map((c) => ({
        name: c.name,
        slug: c.slug,
      })),
      colors: product.colors.map((c) => ({ name: c.name, slug: c.slug })),
      primary_image: product.primary_image,
      images: product.images,
      status: product.status,
      is_published: product.is_published,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    }));

    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { createProduct, getAllProducts };
