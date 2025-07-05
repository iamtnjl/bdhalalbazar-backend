const Product = require("../models/productModel");
const Brand = require("../models/brandModel");
const Tag = require("../models/tagsModel");
const SubCategory = require("../models/SubCategoryModel");
const Material = require("../models/materialModel");
const Category = require("../models/categoryModel");
const Color = require("../models/colorModel");
const paginate = require("../utils/pagination");
const cloudinary = require("../config/cloudinary");
const { applyDiscount } = require("../utils/price");
const Fuse = require("fuse.js");

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
    let {
      name,
      description,
      price,
      discount,
      brand,
      materials,
      categories,
      subCategory,
      tags,
      colors,
      weight,
      unit,
      manufacturer,
      searchTerms,
      mrp_price,
    } = req.body;

    if (typeof name === "string") name = JSON.parse(name);
    if (typeof description === "string") description = JSON.parse(description);

    // Fetch referenced IDs
    const brandDocs = await Brand.find({ slug: { $in: brand } }).select("_id");
    const categoryDocs = await Category.find({
      slug: { $in: categories },
    }).select("_id");
    const materialDocs = await Material.find({
      slug: { $in: materials },
    }).select("_id");
    const colorDocs = await Color.find({ slug: { $in: colors } }).select("_id");

    // Fetch subCategory (optional)
    let subCategoryDoc = null;
    if (subCategory) {
      subCategoryDoc = await SubCategory.findOne({ slug: subCategory });
      if (!subCategoryDoc) {
        return res.status(400).json({ message: "Invalid subCategory" });
      }

      // Ensure subCategory matches one of the selected categories
      if (
        !categoryDocs.find((cat) => cat._id.equals(subCategoryDoc.category))
      ) {
        return res.status(400).json({
          message: "Subcategory does not belong to selected category",
        });
      }
    }
    // Handle images
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

    const product = new Product({
      name: {
        en: name.en,
        bn: name.bn,
      },
      description: {
        en: description.en,
        bn: description.bn,
      },
      searchTerms: searchTerms
        ? searchTerms.split(",").map((s) => s.trim())
        : [],
      price,
      mrp_price,
      discount,
      brand: brandDocs.map((b) => b._id),
      materials: materialDocs.map((m) => m._id),
      categories: categoryDocs.map((c) => c._id),
      subCategory: subCategoryDoc?._id || null,
      tags,
      colors: colorDocs.map((c) => c._id),
      primary_image: primaryImage,
      images: multipleImages,
      weight,
      unit,
      manufacturer,
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
};

const publicGetAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.show) || 20;
    const skip = (page - 1) * limit;

    // === Filters ===
    const must = [{ equals: { path: "is_published", value: true } }];

    if (req.query.minPrice || req.query.maxPrice) {
      const range = {};
      if (req.query.minPrice) range.gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) range.lte = parseFloat(req.query.maxPrice);
      must.push({ range: { path: "price", ...range } });
    }

    const convertToArray = (value) => value.split(",");

    const fetchObjectIds = async (Model, slugs) => {
      const items = await Model.find({ slug: { $in: slugs } }, "_id");
      return items.map((item) => item._id);
    };

    if (req.query.brand) {
      const ids = await fetchObjectIds(Brand, convertToArray(req.query.brand));
      must.push({ in: { path: "brand", value: ids } });
    }

    if (req.query.categories) {
      const ids = await fetchObjectIds(
        Category,
        convertToArray(req.query.categories)
      );
      must.push({ in: { path: "categories", value: ids } });
    }

    if (req.query.materials) {
      const ids = await fetchObjectIds(
        Material,
        convertToArray(req.query.materials)
      );
      must.push({ in: { path: "materials", value: ids } });
    }

    if (req.query.colors) {
      const ids = await fetchObjectIds(Color, convertToArray(req.query.colors));
      must.push({ in: { path: "colors", value: ids } });
    }

    if (req.query.subCategory) {
      const ids = await fetchObjectIds(
        SubCategory,
        convertToArray(req.query.subCategory)
      );
      must.push({ in: { path: "subCategory", value: ids } });
    }

    // === Atlas Search ===
    const searchStage = {
      $search: {
        index: "default",
        compound: {
          must: must,
        },
      },
    };

    if (req.query.search) {
      searchStage.$search.compound.should = [
        {
          text: {
            query: req.query.search,
            path: "name.en",
            fuzzy: { maxEdits: 2 },
            score: { boost: { value: 3 } },
          },
        },
        {
          text: {
            query: req.query.search,
            path: "name.bn",
            fuzzy: { maxEdits: 2 },
            score: { boost: { value: 3 } },
          },
        },
        {
          text: {
            query: req.query.search,
            path: "searchTerms",
            fuzzy: { maxEdits: 1 },
            score: { boost: { value: 2 } },
          },
        },
      ];
      searchStage.$search.compound.minimumShouldMatch = 1;
    }

    // === Sorting ===
    let sortStage = {};
    if (req.query.search) {
      // When searching, sort by relevance score descending
      sortStage = { $sort: { score: { $meta: "textScore" } } };
    } else if (req.query.sort_by) {
      switch (req.query.sort_by) {
        case "price_asc":
          sortStage = { $sort: { price: 1 } };
          break;
        case "price_desc":
          sortStage = { $sort: { price: -1 } };
          break;
        case "newest":
          sortStage = { $sort: { createdAt: -1 } };
          break;
        case "oldest":
          sortStage = { $sort: { createdAt: 1 } };
          break;
        default:
          sortStage = { $sort: { createdAt: -1 } };
          break;
      }
    } else {
      sortStage = { $sort: { createdAt: -1 } };
    }

    // === Pipeline ===
    const pipeline = [
      searchStage,
      sortStage,
      { $skip: skip },
      { $limit: limit },

      // Populations
      {
        $lookup: {
          from: "brands",
          localField: "brand",
          foreignField: "_id",
          as: "brand",
        },
      },
      {
        $lookup: {
          from: "materials",
          localField: "materials",
          foreignField: "_id",
          as: "materials",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $lookup: {
          from: "subcategories",
          localField: "subCategory",
          foreignField: "_id",
          as: "subCategory",
        },
      },
      { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "colors",
          localField: "colors",
          foreignField: "_id",
          as: "colors",
        },
      },
      {
        $lookup: {
          from: "tags",
          localField: "tags",
          foreignField: "_id",
          as: "tags",
        },
      },
    ];

    // === Count ===
    const countPipeline = [searchStage, { $count: "count" }];
    const countResult = await Product.aggregate(countPipeline);
    const totalCount = countResult[0]?.count || 0;

    // === Run main ===
    let results = await Product.aggregate(pipeline);

    // === Transform ===
    results = results.map((product) => {
      const basePrice = product.price;

      const hasMRPTag = product.tags?.some(
        (tag) => tag.name?.toLowerCase() === "mrp"
      );

      let sellingPrice;
      if (hasMRPTag && product.mrp_price) {
        sellingPrice = product.mrp_price;
      } else {
        const tagMargins =
          product.tags?.length > 0
            ? product.tags.map((t) => t.margin || 0)
            : [0];
        const maxMargin = Math.max(...tagMargins);
        sellingPrice = basePrice + (basePrice * maxMargin) / 100;
      }

      const discountPercent = product.discount || 0;
      const discountedPrice =
        sellingPrice - (sellingPrice * discountPercent) / 100;

      const formatNumber = (num) =>
        num % 1 === 0 ? parseInt(num) : parseFloat(num.toFixed(2));

      return {
        _id: product._id,
        name: product.name,
        price: formatNumber(sellingPrice),
        discount: discountPercent,
        discounted_price: formatNumber(discountedPrice),
        brand: product.brand.map((b) => ({ name: b.name, slug: b.slug })),
        materials: product.materials.map((m) => ({
          name: m.name,
          slug: m.slug,
        })),
        categories: product.categories.map((c) => ({
          name: c.name,
          slug: c.slug,
        })),
        sub_category: product?.subCategory
          ? {
              name: product.subCategory.name,
              slug: product.subCategory.slug,
            }
          : null,
        colors: product.colors.map((c) => ({ name: c.name, slug: c.slug })),
        tags: product.tags?.map((t) => ({
          name: t.name,
          margin: t.margin,
        })),
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

    // === Next/Prev ===
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${
      req.path
    }`;
    const queryParams = new URLSearchParams(req.query);
    queryParams.set("show", limit);
    queryParams.delete("page");

    const nextPage =
      page * limit < totalCount
        ? `${baseUrl}?${queryParams.toString()}&page=${page + 1}`
        : null;

    const prevPage =
      page > 1 ? `${baseUrl}?${queryParams.toString()}&page=${page - 1}` : null;

    res.status(200).json({
      count: totalCount,
      next: nextPage,
      previous: prevPage,
      results,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    let query = {};

    // Filtering by price range
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
    await applySlugFilter("tags", Tag);
    await applySlugFilter("subCategory", SubCategory);

    // Sorting
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

    // 👉 Get ALL matching products first (filters only)
    let products = await Product.find(query)
      .populate([
        "brand",
        "materials",
        "categories",
        "colors",
        "tags",
        "subCategory",
      ])
      .sort(sort);

    // 👉 If search exists, apply Fuse locally
    if (req.query.search) {
      const fuse = new Fuse(products, {
        keys: [
          { name: "name.en", weight: 0.5 },
          { name: "name.bn", weight: 0.5 },
          { name: "searchTerms", weight: 0.5 },
        ],
        threshold: 0.4,
      });

      const fuseResults = fuse.search(req.query.search);
      products = fuseResults.map((r) => r.item);
    }

    // Manual pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const totalCount = products.length;

    const start = (page - 1) * limit;
    const end = start + limit;

    const paginatedResults = products.slice(start, end);

    // Build next/prev URLs
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${
      req.path
    }`;
    const queryParams = new URLSearchParams(req.query);
    queryParams.set("show", limit);
    queryParams.delete("page");

    const nextPage =
      page * limit < totalCount
        ? `${baseUrl}?${queryParams.toString()}&page=${page + 1}`
        : null;

    const prevPage =
      page > 1 ? `${baseUrl}?${queryParams.toString()}&page=${page - 1}` : null;

    // Transform
    const transformProduct = (product) => {
      const basePrice = product.price;

      const hasMRPTag = product.tags?.some(
        (tag) => tag.name.toLowerCase() === "mrp"
      );

      let sellingPrice;
      if (hasMRPTag && product.mrp_price) {
        sellingPrice = product.mrp_price;
      } else {
        const tagMargins =
          product.tags?.length > 0
            ? product.tags.map((t) => t.margin || 0)
            : [0];
        const maxMargin = Math.max(...tagMargins);
        sellingPrice = basePrice + (basePrice * maxMargin) / 100;
      }

      const discountPercent = product.discount || 0;
      const discountedPrice =
        sellingPrice - (sellingPrice * discountPercent) / 100;

      const formatNumber = (num) =>
        num % 1 === 0 ? parseInt(num) : parseFloat(num.toFixed(2));

      return {
        _id: product._id,
        name: product.name,
        price: basePrice,
        mrp_price: product.mrp_price || null,
        selling_price: formatNumber(sellingPrice),
        discount: discountPercent,
        discounted_price: formatNumber(discountedPrice),
        brand: product.brand.map((b) => ({ name: b.name, slug: b.slug })),
        materials: product.materials.map((m) => ({
          name: m.name,
          slug: m.slug,
        })),
        categories: product.categories.map((c) => ({
          name: c.name,
          slug: c.slug,
        })),
        sub_category: product?.subCategory
          ? {
              name: product.subCategory.name,
              slug: product.subCategory.slug,
            }
          : null,
        tags:
          product?.tags?.length > 0
            ? product.tags.map((t) => ({
                name: t.name,
                _id: t._id,
                margin: t.margin,
              }))
            : [],
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
    };

    const results = paginatedResults.map(transformProduct);

    res.status(200).json({
      count: totalCount,
      next: nextPage,
      previous: prevPage,
      results,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

const getProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId)
      .populate("brand", "name slug")
      .populate("materials", "name slug")
      .populate("categories", "name slug")
      .populate("colors", "name slug")
      .populate("tags", "name margin"); // Include tags!

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    const basePrice = product.price;

    // Check for MRP tag
    const hasMRPTag = product.tags?.some(
      (tag) => tag.name?.toLowerCase() === "mrp"
    );

    let sellingPrice;
    if (hasMRPTag && product.mrp_price) {
      sellingPrice = product.mrp_price;
    } else {
      const tagMargins =
        product.tags?.length > 0 ? product.tags.map((t) => t.margin || 0) : [0];
      const maxMargin = Math.max(...tagMargins);
      sellingPrice = basePrice + (basePrice * maxMargin) / 100;
    }

    const discountPercent = product.discount || 0;
    const discountedPrice =
      sellingPrice - (sellingPrice * discountPercent) / 100;

    const formatNumber = (num) =>
      num % 1 === 0 ? parseInt(num) : parseFloat(num.toFixed(2));

    let images = product.images || [];
    if (product.primary_image) {
      images = [
        product.primary_image,
        ...images.filter(
          (img) => img.original !== product.primary_image.original
        ),
      ];
    }

    res.status(200).json({
      _id: product._id,
      name: product.name,
      price: formatNumber(sellingPrice), // Final selling price
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

const getAdminProductDetails = async (req, res) => {
  try {
    const { productId } = req.params;

    // Fetch product with populated references
    const product = await Product.findById(productId)
      .populate("brand", "name slug")
      .populate("materials", "name slug")
      .populate("categories", "name slug")
      .populate("colors", "name slug")
      .populate("tags", "name slug") // ✅ add tags
      .populate("subCategory", "name slug"); // ✅ add subCategory

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Calculate adjusted price with profit margin if applicable
    const basePrice = product.price;
    const priceWithProfit = basePrice;

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

    // Send formatted response with new fields
    res.status(200).json({
      _id: product._id,
      name: product.name,
      price: formatNumber(priceWithProfit),
      mrp_price: formatNumber(product.mrp_price),
      discount: formatNumber(discountPercent),
      discounted_price: formatNumber(discountedPrice),
      stock_id: product.stock_id,
      brand: product.brand,
      materials: product.materials,
      categories: product.categories,
      subCategory: product.subCategory, // ✅ added
      colors: product.colors,
      tags: product.tags, // ✅ added
      searchTerms: product.searchTerms || [], // ✅ added
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

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    let {
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
      subCategory,
      tags,
      searchTerms,
      mrp_price,
    } = req.body;
    if (typeof name === "string") name = JSON.parse(name);
    if (typeof description === "string") description = JSON.parse(description);

    const updateData = {};

    // Basic fields
    if (name) updateData.name = name;
    if (price) updateData.price = price;
    if (mrp_price) updateData.mrp_price = mrp_price;
    if (discount) updateData.discount = discount;
    if (weight) updateData.weight = weight;
    if (unit) updateData.unit = unit;
    if (description) updateData.description = description;
    if (manufacturer) updateData.manufacturer = manufacturer;
    if (is_published !== undefined) updateData.is_published = is_published;
    if (status) updateData.status = status;

    // Search Terms: if provided, split and trim
    if (searchTerms) {
      if (typeof searchTerms === "string") {
        updateData.searchTerms = searchTerms.split(",").map((s) => s.trim());
      } else if (Array.isArray(searchTerms)) {
        updateData.searchTerms = searchTerms;
      }
    }

    // Tags: assume they come as array of IDs or strings
    if (tags) {
      updateData.tags = Array.isArray(tags)
        ? tags
        : tags.split(",").map((t) => t.trim());
    }

    // Subcategory: fetch and validate
    if (subCategory) {
      const subCategoryDoc = await SubCategory.findOne({ slug: subCategory });
      if (!subCategoryDoc) {
        return res.status(400).json({ message: "Invalid subCategory" });
      }
      updateData.subCategory = subCategoryDoc._id;
    }

    // Fetch referenced IDs
    if (brand) {
      const brandSlugs = toSlugArray(brand);
      const brandDocs = await Brand.find({ slug: { $in: brandSlugs } });
      updateData.brand = brandDocs.map((b) => b._id);
    }

    if (categories) {
      const categoryDocs = await Category.find({ slug: { $in: categories } });
      updateData.categories = categoryDocs.map((c) => c._id);
    }

    if (materials) {
      const materialSlugs = toSlugArray(materials);
      const materialDocs = await Material.find({
        slug: { $in: materialSlugs },
      });
      updateData.materials = materialDocs.map((m) => m._id);
    }

    if (colors) {
      const colorSlugs = toSlugArray(colors);
      const colorDocs = await Color.find({ slug: { $in: colorSlugs } });
      updateData.colors = colorDocs.map((c) => c._id);
    }

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

    // Final update
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
  getAdminProductDetails,
  updateProduct,
  updateProductVisibility,
  deleteProductById,
};
