const Product = require("../models/productModel");
const Brand = require("../models/brandModel");
const Material = require("../models/materialModel");
const Category = require("../models/categoryModel");
const Settings = require("../models/settingsModel");
const Color = require("../models/colorModel");
const paginate = require("../utils/pagination");
const cloudinary = require("../config/cloudinary");
const { applyProfitMargin, applyDiscount } = require("../utils/price");

const toSlugArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

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
      weight,
      unit,
      description,
      manufacturer,
    } = req.body;

    // Fetch brand, category, material, and color IDs from slugs
    const brandDocs = await Brand.find({ slug: { $in: brand } }).select("_id");
    const categoryDocs = await Category.find({
      slug: { $in: categories },
    }).select("_id");
    const materialDocs = await Material.find({
      slug: { $in: materials },
    }).select("_id");
    const colorDocs = await Color.find({ slug: { $in: colors } }).select("_id");

    // Initialize the image objects
    let primaryImage = {};
    let multipleImages = [];

    // Handle single primary image upload
    if (req.files && req.files.primary_image) {
      const primaryImageUpload = await cloudinary.uploader.upload(
        req.files.primary_image[0].path,
        { folder: "product_images" }
      );

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

    // Handle multiple image uploads
    if (req.files && req.files.images) {
      for (let i = 0; i < req.files.images.length; i++) {
        const imageUpload = await cloudinary.uploader.upload(
          req.files.images[i].path,
          { folder: "product_images" }
        );

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

    // Create the product
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
      weight,
      unit,
      description,
      manufacturer,
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const publicGetAllProducts = async (req, res) => {
  try {
    let query = { is_published: true };

    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: "i" };
    }

    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
    }

    const convertToArray = (value) => value.split(",");

    const fetchObjectIds = async (Model, slugs) => {
      const items = await Model.find({ slug: { $in: slugs } }, "_id");
      return items.map((item) => item._id);
    };

    const applySlugFilter = async (field, model) => {
      if (req.query[field]) {
        const slugs = convertToArray(req.query[field]);
        const ids = await fetchObjectIds(model, slugs);
        query[field] = { $in: ids };
      }
    };

    await applySlugFilter("brand", Brand);
    await applySlugFilter("categories", Category);
    await applySlugFilter("materials", Material);
    await applySlugFilter("colors", Color);

    let sort = {};
    if (req.query.sort_by) {
      switch (req.query.sort_by) {
        case "price_asc":
          sort = { price: 1 };
          break;
        case "price_desc":
          sort = { price: -1 };
          break;
        case "newest":
          sort = { createdAt: -1 };
          break;
        case "oldest":
          sort = { createdAt: 1 };
          break;
        default:
          sort = { createdAt: -1 };
          break;
      }
    }

    const settings = await Settings.findOne();
    const profitMargin = settings?.profit_margin || 0;

    const profitCategoryNames = [
      "vegetable",
      "meat",
      "beef",
      "mutton",
      "chicken",
      "fish",
    ];
    const profitCategories = await Category.find({
      slug: { $in: profitCategoryNames },
    });
    const profitCategoryIds = profitCategories.map((c) => c._id.toString());

    const paginatedData = await paginate(
      Product,
      query,
      req,
      ["brand", "materials", "categories", "colors"],
      sort
    );

    const hasProfitCategory = (productCategories) => {
      return productCategories.some((cat) =>
        profitCategoryIds.includes(cat._id.toString())
      );
    };

    paginatedData.results = paginatedData.results.map((product) => {
      const useProfitMargin = hasProfitCategory(product.categories);
      const adjustedPrice = useProfitMargin
        ? applyProfitMargin(product.price, profitMargin)
        : product.price;
      const discountedPrice = applyDiscount(adjustedPrice, product.discount);

      return {
        _id: product._id,
        name: product.name,
        price: adjustedPrice,
        discount: product.discount,
        discounted_price: discountedPrice,
        brand: product.brand.map((b) => ({ name: b.name, slug: b.slug })),
        materials: product.materials.map((m) => ({
          name: m.name,
          slug: m.slug,
        })),
        categories: product.categories.map((c) => ({
          name: c.name,
          slug: c.slug,
        })),
        colors: product.colors.map((c) => ({ name: c.name, slug: c.slug })),
        primary_image: product.primary_image,
        weight: product.weight,
        unit: product.unit,
        images: product.images,
        status: product.status,
        is_published: product.is_published,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        stock: product.stock,
        orderable_stock: product.orderable_stock,
      };
    });

    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const getAllProducts = async (req, res) => {
  try {
    let query = {};

    // Search by name
    if (req.query.search) {
      query.name = { $regex: req.query.search, $options: "i" };
    }

    // Filtering by price range
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
    }

    // Function to convert a comma-separated string into an array
    const convertToArray = (value) => value.split(",");

    // Function to fetch ObjectIds from slugs
    const fetchObjectIds = async (Model, slugs) => {
      const items = await Model.find({ slug: { $in: slugs } }, "_id");
      return items.map((item) => item._id);
    };

    // Unified filtering for brand, categories, materials, and colors (using slugs)
    const applySlugFilter = async (field, model) => {
      if (req.query[field]) {
        const slugs = convertToArray(req.query[field]);
        const ids = await fetchObjectIds(model, slugs);
        query[field] = { $in: ids };
      }
    };

    // Apply filters for brand, categories, materials, and colors
    await applySlugFilter("brand", Brand);
    await applySlugFilter("categories", Category);
    await applySlugFilter("materials", Material);
    await applySlugFilter("colors", Color);

    // Sorting logic
    let sort = {};
    if (req.query.sort_by) {
      switch (req.query.sort_by) {
        case "price_asc":
          sort = { price: -1 };
          break;
        case "price_desc":
          sort = { price: 1 };
          break;
        case "newest":
          sort = { createdAt: -1 };
          break;
        case "oldest":
          sort = { createdAt: 1 };
          break;
        default:
          sort = { createdAt: -1 };
          break;
      }
    }

    // Get paginated results with populated fields
    const paginatedData = await paginate(
      Product,
      query,
      req,
      ["brand", "materials", "categories", "colors"],
      sort
    );

    // Discount calculation
    const calculateDiscount = (product) => {
      const discountedPrice =
        product.price - (product.price * product.discount) / 100;
      return discountedPrice % 1 === 0
        ? parseInt(discountedPrice)
        : parseFloat(discountedPrice.toFixed(2));
    };

    // Transform the results
    paginatedData.results = paginatedData.results.map((product) => ({
      _id: product._id,
      name: product.name,
      price: product.price,
      discount: product.discount,
      discounted_price: calculateDiscount(product),
      brand: product.brand.map((b) => ({ name: b.name, slug: b.slug })),
      materials: product.materials.map((m) => ({ name: m.name, slug: m.slug })),
      categories: product.categories.map((c) => ({
        name: c.name,
        slug: c.slug,
      })),
      colors: product.colors.map((c) => ({ name: c.name, slug: c.slug })),
      primary_image: product.primary_image,
      weight: product.weight,
      unit: product.unit,
      images: product.images,
      status: product.status,
      is_published: product.is_published,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      stock: product.stock,
      orderable_stock: product.orderable_stock,
    }));

    res.status(200).json(paginatedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;

    // Fetch product with populated references
    const product = await Product.findById(productId)
      .populate("brand", "name slug")
      .populate("materials", "name slug")
      .populate("categories", "name slug")
      .populate("colors", "name slug");

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Fetch profit margin from settings
    const settings = await Settings.findOne();
    const profitMargin = settings?.profit_margin || 0;

    // Categories that require profit margin application
    const profitCategorySlugs = [
      "vegetable",
      "meat",
      "beef",
      "mutton",
      "chicken",
      "fish",
    ];
    const profitCategories = await Category.find({
      slug: { $in: profitCategorySlugs },
    });
    const profitCategoryIds = profitCategories.map((cat) => cat._id.toString());

    // Check if product belongs to any profit margin category
    const isProfitApplied = product.categories.some((cat) =>
      profitCategoryIds.includes(cat._id.toString())
    );

    // Calculate adjusted price with profit margin if applicable
    const basePrice = product.price;
    const priceWithProfit = isProfitApplied
      ? applyProfitMargin(basePrice, profitMargin)
      : basePrice;

    // Calculate discount and discounted price
    const discountPercent = product.discount || 0;
    const discountedPrice = applyDiscount(priceWithProfit, discountPercent);

    // Format price, discount, and discounted price for consistent decimal places
    const formatNumber = (num) =>
      num % 1 === 0 ? parseInt(num) : parseFloat(num.toFixed(2));

    // Format images ensuring primary image first
    let images = product.images || [];
    if (product.primary_image) {
      images = [
        product.primary_image,
        ...images.filter(
          (img) => img.original !== product.primary_image.original
        ),
      ];
    }

    // Send formatted response
    res.status(200).json({
      _id: product._id,
      name: product.name,
      price: formatNumber(priceWithProfit),
      discount: formatNumber(discountPercent),
      discounted_price: formatNumber(discountedPrice),
      stock_id: product.stock_id,
      brand: product.brand,
      materials: product.materials,
      categories: product.categories,
      colors: product.colors,
      images,
      status: product.status,
      is_published: product.is_published,
      stock: product.stock,
      orderable_stock: product.orderable_stock,
      ad_pixel_id: product.ad_pixel_id,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      weight: product.weight,
      unit: product.unit,
      description: product.description,
    });
  } catch (error) {
    console.error("getProductDetails error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = getProductDetails;

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      price,
      discount,
      brand,
      materials,
      categories,
      colors,
      weight,
      unit,
      description,
      manufacturer,
      is_published,
      status,
    } = req.body;

    const updateData = {};

    // Basic fields
    if (name) updateData.name = name;
    if (price) updateData.price = price;
    if (discount) updateData.discount = discount;
    if (weight) updateData.weight = weight;
    if (unit) updateData.unit = unit;
    if (description) updateData.description = description;
    if (manufacturer) updateData.manufacturer = manufacturer;
    if (is_published !== undefined) updateData.is_published = is_published;
    if (status) updateData.status = status;

    // Fetch referenced IDs using slugs

    const brandSlugs = toSlugArray(brand);
    const brandDocs = await Brand.find({ slug: { $in: brandSlugs } });
    updateData.brand = brandDocs.map((b) => b._id);

    const categoryDocs = await Category.find({ slug: { $in: categories } });
    updateData.categories = categoryDocs.map((c) => c._id);

    const materialSlugs = toSlugArray(materials);
    const materialDocs = await Material.find({
      slug: { $in: materialSlugs },
    });
    updateData.materials = materialDocs.map((m) => m._id);

    const colorSlugs = toSlugArray(colors);
    const colorDocs = await Color.find({ slug: { $in: colorSlugs } });
    updateData.colors = colorDocs.map((c) => c._id);

    // Handle primary image
    if (req.files?.primary_image) {
      const file = req.files.primary_image[0];

      const [original, thumbnail, medium] = await Promise.all([
        cloudinary.uploader.upload(file.path, { folder: "product_images" }),
        cloudinary.uploader.upload(file.path, {
          folder: "product_images",
          transformation: [{ width: 150, height: 150, crop: "fill" }],
        }),
        cloudinary.uploader.upload(file.path, {
          folder: "product_images",
          transformation: [{ width: 600, height: 600, crop: "limit" }],
        }),
      ]);

      updateData.primary_image = {
        original: original.secure_url,
        thumbnail: thumbnail.secure_url,
        medium: medium.secure_url,
      };
    }

    // Handle multiple images
    if (req.files?.images?.length > 0) {
      const multipleImages = await Promise.all(
        req.files.images.map(async (file) => {
          const [original, thumbnail, medium] = await Promise.all([
            cloudinary.uploader.upload(file.path, { folder: "product_images" }),
            cloudinary.uploader.upload(file.path, {
              folder: "product_images",
              transformation: [{ width: 150, height: 150, crop: "fill" }],
            }),
            cloudinary.uploader.upload(file.path, {
              folder: "product_images",
              transformation: [{ width: 600, height: 600, crop: "limit" }],
            }),
          ]);

          return {
            original: original.secure_url,
            thumbnail: thumbnail.secure_url,
            medium: medium.secure_url,
          };
        })
      );

      updateData.images = multipleImages;
    }

    // Perform the update
    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Product update error:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateProductVisibility = async (req, res) => {
  const { id } = req.params;
  const { is_published } = req.body;

  if (typeof is_published !== "boolean") {
    return res.status(400).json({ error: "'is_published' must be a boolean." });
  }

  try {
    const product = await Product.findByIdAndUpdate(
      id,
      { is_published },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }

    res
      .status(200)
      .json({ message: "Product publish status updated.", product });
  } catch (error) {
    res.status(500).json({ error: "Server error.", details: error.message });
  }
};

const deleteProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.status(200).json({
      message: "Product successfully deleted.",
      deletedProduct,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to delete the product.",
      details: error.message,
    });
  }
};

module.exports = {
  createProduct,
  publicGetAllProducts,
  getAllProducts,
  getProductDetails,
  updateProduct,
  updateProductVisibility,
  deleteProductById,
};
