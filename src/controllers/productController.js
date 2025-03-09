const Product = require("../models/productModel");
const Brand = require("../models/BrandModel");
const Material = require("../models/materialModel");
const Category = require("../models/categoryModel");
const Color = require("../models/colorModel");
const paginate = require("../utils/pagination");
const cloudinary = require("../config/cloudinary");


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
      status,
      stock,
      orderable_stock,
      is_published,
      ad_pixel_id,
      manufacturer,
    } = req.body;

    console.log({ bode: req.body, file: req.file });

    // Fetch brand, category, material, and color IDs from slugs
    const brandDocs = await Brand.find({ slug: { $in: brand } }).select("_id");
    const categoryDocs = await Category.find({
      slug: { $in: categories },
    }).select("_id");
    const materialDocs = await Material.find({
      slug: { $in: materials },
    }).select("_id");
    const colorDocs = await Color.find({ slug: { $in: colors } }).select("_id");

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
      status,
      is_published,
      ad_pixel_id,
      stock,
      orderable_stock,
      manufacturer,
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
      .populate("brand", "name")
      .populate("materials", "name")
      .populate("categories", "name")
      .populate("colors", "name");

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Ensure price and discount follow the correct format
    const price =
      product.price % 1 === 0
        ? parseInt(product.price)
        : parseFloat(product.price.toFixed(2));
    const discount =
      product.discount % 1 === 0
        ? parseInt(product.discount)
        : parseFloat(product.discount.toFixed(2));

    // Calculate discounted price
    const discountedPrice =
      product.price - (product.price * product.discount) / 100;
    const formattedDiscountedPrice =
      discountedPrice % 1 === 0
        ? parseInt(discountedPrice)
        : parseFloat(discountedPrice.toFixed(2));

    // Ensure primary image is always the first in the images array
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
      price,
      discount,
      discounted_price: formattedDiscountedPrice,
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
    });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { createProduct, getAllProducts, getProductDetails };
