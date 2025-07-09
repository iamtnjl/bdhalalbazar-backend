const mongoose = require("mongoose");
const Product = require("../models/productModel");
const ProductLog = require("../models/ProductLogModel");
const Brand = require("../models/brandModel");
const Tag = require("../models/tagsModel");
const SubCategory = require("../models/SubCategoryModel");
const Material = require("../models/materialModel");
const Category = require("../models/categoryModel");
const Color = require("../models/colorModel");
const cloudinary = require("../config/cloudinary");
const { applyDiscount } = require("../utils/price");

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

      // ✅ ✅ ✅ The key part!
      createdBy: req.user._id,
      updatedBy: req.user._id,
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
    let query = { is_published: true };

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
        if (ids.length > 0) query[field] = { $in: ids };
      }
    };

    await Promise.all([
      applySlugFilter("brand", Brand),
      applySlugFilter("categories", Category),
      applySlugFilter("materials", Material),
      applySlugFilter("colors", Color),
      applySlugFilter("subCategory", SubCategory),
    ]);

    let sort = { createdAt: -1 };
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
      }
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    let products;
    let totalCount;

    if (req.query.search) {
      const pipeline = [];

      pipeline.push({
        $search: {
          index: "products",
          compound: {
            minimumShouldMatch: 1,
            should: [
              {
                text: {
                  query: req.query.search,
                  path: "name.en",
                  fuzzy: { maxEdits: 2 },
                  score: { boost: { value: 1 } },
                },
              },
              {
                text: {
                  query: req.query.search,
                  path: "name.bn",
                  fuzzy: { maxEdits: 2 },
                  score: { boost: { value: 1 } },
                },
              },
              {
                wildcard: {
                  query: `${req.query.search.toLowerCase()}*`,
                  path: "searchTerms",
                  score: { boost: { value: 10 } },
                  allowAnalyzedField: true,
                },
              },
            ],
          },
        },
      });

      // Project search score to use for sorting
      pipeline.push({
        $addFields: { searchScore: { $meta: "searchScore" } },
      });

      // Match other filters
      pipeline.push({ $match: query });

      // Sort by relevance first
      pipeline.push({ $sort: { searchScore: -1 } });

      // Then apply user sort if any
      if (req.query.sort_by) {
        switch (req.query.sort_by) {
          case "price_asc":
            pipeline.push({ $sort: { price: 1 } });
            break;
          case "price_desc":
            pipeline.push({ $sort: { price: -1 } });
            break;
          case "newest":
            pipeline.push({ $sort: { createdAt: -1 } });
            break;
          case "oldest":
            pipeline.push({ $sort: { createdAt: 1 } });
            break;
        }
      }

      // Pagination
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });

      // Lookups for referenced fields
      pipeline.push(
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
            from: "categories",
            localField: "categories",
            foreignField: "_id",
            as: "categories",
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
        }
      );

      // Count total matching documents (without pagination and lookups)
      const countPipeline = pipeline.filter(
        (stage) =>
          !("$skip" in stage) &&
          !("$limit" in stage) &&
          !("$lookup" in stage) &&
          !(
            "$sort" in stage &&
            Object.keys(stage.$sort).some((k) =>
              ["price", "createdAt"].includes(k)
            )
          ) // remove second sort too
      );
      countPipeline.push({ $count: "totalCount" });
      const countResult = await Product.aggregate(countPipeline).exec();
      totalCount = countResult[0] ? countResult[0].totalCount : 0;

      products = await Product.aggregate(pipeline).exec();
    } else {
      // No search - normal find + populate
      totalCount = await Product.countDocuments(query);
      products = await Product.find(query)
        .populate(["brand", "materials", "categories", "colors", "tags"])
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean();
    }

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

    // Format prices and results as before
    const formatNumber = (num) =>
      num % 1 === 0 ? parseInt(num) : parseFloat(num.toFixed(2));

    const results = products.map((product) => {
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

      return {
        _id: product._id,
        name: product.name,
        price: formatNumber(sellingPrice),
        discount: discountPercent,
        discounted_price: formatNumber(discountedPrice),
        brand:
          product.brand?.map((b) => ({ name: b.name, slug: b.slug })) || [],
        materials:
          product.materials?.map((m) => ({ name: m.name, slug: m.slug })) || [],
        categories:
          product.categories?.map((c) => ({ name: c.name, slug: c.slug })) ||
          [],
        colors:
          product.colors?.map((c) => ({ name: c.name, slug: c.slug })) || [],
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
    let sortStage = {};
    if (req.query.sort_by) {
      switch (req.query.sort_by) {
        case "price_asc":
          sortStage = { price: 1 };
          break;
        case "price_desc":
          sortStage = { price: -1 };
          break;
        case "newest":
          sortStage = { createdAt: -1 };
          break;
        case "oldest":
          sortStage = { createdAt: 1 };
          break;
        default:
          sortStage = { createdAt: -1 };
          break;
      }
    } else {
      sortStage = { createdAt: -1 };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let products = [];
    let totalCount = 0;

    if (req.query.search) {
      const pipeline = [];

      // Atlas Search stage
      pipeline.push({
        $search: {
          index: "products",
          compound: {
            should: [
              {
                text: {
                  query: req.query.search,
                  path: "name.en",
                  fuzzy: { maxEdits: 2 },
                },
              },
              {
                text: {
                  query: req.query.search,
                  path: "name.bn",
                  fuzzy: { maxEdits: 2 },
                },
              },
              {
                wildcard: {
                  query: `${req.query.search.toLowerCase()}*`,
                  path: "searchTerms",
                  allowAnalyzedField: true,
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      });

      // Add relevance score for sorting
      pipeline.push({
        $addFields: {
          searchScore: { $meta: "searchScore" },
        },
      });

      // Apply filter query
      pipeline.push({ $match: query });

      // Sort by relevance first, then user sort
      pipeline.push({ $sort: { searchScore: -1, ...sortStage } });

      // Pagination
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limit });

      // Lookups
      pipeline.push(
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
            from: "categories",
            localField: "categories",
            foreignField: "_id",
            as: "categories",
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
        {
          $lookup: {
            from: "subcategories",
            localField: "subCategory",
            foreignField: "_id",
            as: "subCategory",
          },
        },
        {
          $unwind: {
            path: "$subCategory",
            preserveNullAndEmptyArrays: true,
          },
        }
      );

      // Get total count separately
      const countPipeline = pipeline.filter(
        (stage) =>
          !("$skip" in stage) &&
          !("$limit" in stage) &&
          !("$lookup" in stage) &&
          !("$unwind" in stage) &&
          !("$addFields" in stage)
      );
      countPipeline.push({ $count: "totalCount" });

      const [result, countResult] = await Promise.all([
        Product.aggregate(pipeline).exec(),
        Product.aggregate(countPipeline).exec(),
      ]);

      products = result;
      totalCount = countResult[0] ? countResult[0].totalCount : 0;
    } else {
      totalCount = await Product.countDocuments(query);
      products = await Product.find(query)
        .populate([
          "brand",
          "materials",
          "categories",
          "colors",
          "tags",
          "subCategory",
        ])
        .sort(sortStage)
        .skip(skip)
        .limit(limit);
    }

    // Pagination URLs
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
        brand: product.brand?.map?.((b) => ({ name: b.name, slug: b.slug })),
        materials: product.materials?.map?.((m) => ({
          name: m.name,
          slug: m.slug,
        })),
        categories: product.categories?.map?.((c) => ({
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
        colors: product.colors?.map?.((c) => ({ name: c.name, slug: c.slug })),
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

    const results = products.map(transformProduct);

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

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // ✅ Modify fields directly
    if (name) product.name = name;
    if (price) product.price = price;
    if (mrp_price) product.mrp_price = mrp_price;
    if (discount) product.discount = discount;
    if (weight) product.weight = weight;
    if (unit) product.unit = unit;
    if (description) product.description = description;
    if (manufacturer) product.manufacturer = manufacturer;
    if (is_published !== undefined) product.is_published = is_published;
    if (status) product.status = status;

    if (searchTerms) {
      if (typeof searchTerms === "string") {
        product.searchTerms = searchTerms.split(",").map((s) => s.trim());
      } else if (Array.isArray(searchTerms)) {
        product.searchTerms = searchTerms;
      }
    }

    if (tags) {
      product.tags = Array.isArray(tags)
        ? tags
        : tags.split(",").map((t) => t.trim());
    }

    if (subCategory) {
      const subCategoryDoc = await SubCategory.findOne({ slug: subCategory });
      if (!subCategoryDoc) {
        return res.status(400).json({ message: "Invalid subCategory" });
      }
      product.subCategory = subCategoryDoc._id;
    }

    if (brand) {
      const brandSlugs = toSlugArray(brand);
      const brandDocs = await Brand.find({ slug: { $in: brandSlugs } });
      product.brand = brandDocs.map((b) => b._id);
    }

    if (categories) {
      const categoryDocs = await Category.find({ slug: { $in: categories } });
      product.categories = categoryDocs.map((c) => c._id);
    }

    if (materials) {
      const materialSlugs = toSlugArray(materials);
      const materialDocs = await Material.find({
        slug: { $in: materialSlugs },
      });
      product.materials = materialDocs.map((m) => m._id);
    }

    if (colors) {
      const colorSlugs = toSlugArray(colors);
      const colorDocs = await Color.find({ slug: { $in: colorSlugs } });
      product.colors = colorDocs.map((c) => c._id);
    }

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
      product.primary_image = {
        original: original.secure_url,
        thumbnail: thumbnail.secure_url,
        medium: medium.secure_url,
      };
    }

    if (req.files?.images?.length > 0) {
      const multipleImages = await Promise.all(
        req.files.images.map(async (file) => {
          const [original, thumbnail, medium] = await Promise.all([
            cloudinary.uploader.upload(file.path, {
              folder: "product_images",
            }),
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
      product.images = multipleImages;
    }

    // ✅ Set `updatedBy` for audit trail
    product.updatedBy = req.user._id;

    await product.save();

    res.status(200).json(product);
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
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }

    product.is_published = is_published;
    product.updatedBy = req.user._id;

    await product.save();

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

const dailyProductLogByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const logs = await ProductLog.find({
      changedBy: userId,
      createdAt: { $gte: start, $lte: end },
    }).lean();

    const createdIds = new Set();
    const updateLogs = [];

    for (const log of logs) {
      if (log.action === "create") {
        createdIds.add(log.refId.toString());
      } else if (log.action === "update") {
        updateLogs.push(log);
      }
    }

    const addedProducts = await Product.find({
      _id: { $in: Array.from(createdIds) },
    })
      .populate("categories", "name")
      .populate("subCategory", "name")
      .lean();

    const added = addedProducts.map((p) => ({
      _id: p._id,
      name: p.name,
      categories: p.categories,
      subCategory: p.subCategory,
      weight: p.weight,
      unit: p.unit,
      primary_image: p.primary_image,
    }));

    const updatedMap = new Map();

    for (const log of updateLogs) {
      let entry = updatedMap.get(log.refId.toString());
      if (!entry) {
        const product = await Product.findById(log.refId)
          .populate("categories", "name")
          .populate("subCategory", "name")
          .lean();

        if (!product) continue;

        entry = {
          _id: product._id,
          name: product.name,
          categories: product.categories,
          subCategory: product.subCategory,
          weight: product.weight,
          unit: product.unit,
          primary_image: product.primary_image,
          changes: [],
        };

        updatedMap.set(log.refId.toString(), entry);
      }

      for (const change of log.changes) {
        const resolvedChange = {
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        };

        let refModel = null;
        if (change.field.includes("brand")) refModel = Brand;
        else if (change.field.includes("categories")) refModel = Category;
        else if (change.field.includes("subCategory")) refModel = SubCategory;
        else if (change.field.includes("materials")) refModel = Material;
        else if (change.field.includes("tags")) refModel = Tag;
        else if (change.field.includes("colors")) refModel = Color;

        if (refModel) {
          // Replace with resolved name(s)
          if (Array.isArray(change.oldValue) && change.oldValue.length) {
            const oldDocs = await refModel
              .find({ _id: { $in: change.oldValue } })
              .select("name")
              .lean();
            resolvedChange.oldValue = oldDocs.map((d) => d.name);
          } else if (mongoose.isValidObjectId(change.oldValue)) {
            const oldDoc = await refModel
              .findById(change.oldValue)
              .select("name")
              .lean();
            resolvedChange.oldValue = oldDoc?.name || null;
          }

          if (Array.isArray(change.newValue) && change.newValue.length) {
            const newDocs = await refModel
              .find({ _id: { $in: change.newValue } })
              .select("name")
              .lean();
            resolvedChange.newValue = newDocs.map((d) => d.name);
          } else if (mongoose.isValidObjectId(change.newValue)) {
            const newDoc = await refModel
              .findById(change.newValue)
              .select("name")
              .lean();
            resolvedChange.newValue = newDoc?.name || null;
          }
        }

        entry.changes.push(resolvedChange);
      }
    }

    const updated = Array.from(updatedMap.values());

    return res.status(200).json({
      totalAddedCount: added.length,
      totalUpdatedCount: updated.length,
      added,
      updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const getProductStats = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const totalCount = await Product.countDocuments();
    const todayUpdatedCount = await Product.countDocuments({
      updatedAt: { $gte: todayStart, $lte: todayEnd },
    });
    const publishedCount = await Product.countDocuments({ is_published: true });
    const hasTagCount = await Product.countDocuments({
      tags: { $exists: true, $not: { $size: 0 } },
    });
    const hasSearchTermCount = await Product.countDocuments({
      searchTerms: { $exists: true, $not: { $size: 0 } },
    });
    const hasNameDescCount = await Product.countDocuments({
      "name.en": { $exists: true, $ne: "" },
      "name.bn": { $exists: true, $ne: "" },
      "description.en": { $exists: true, $ne: "" },
      "description.bn": { $exists: true, $ne: "" },
    });

    // Get logs for products
    const productLogs = await ProductLog.find({ refModel: "Product" })
      .populate("changedBy", "name phone")
      .sort({ createdAt: -1 });

    const productIds = [
      ...new Set(productLogs.map((log) => log.refId.toString())),
    ];
    const products = await Product.find(
      { _id: { $in: productIds } },
      "_id name"
    );

    const productMap = {};
    products.forEach((p) => {
      productMap[p._id.toString()] = p.name;
    });

    res.status(200).json({
      totalCount,
      todayUpdatedCount,
      publishedCount,
      hasTagCount,
      hasSearchTermCount,
      hasNameDescCount,
    });
  } catch (error) {
    console.error("Error fetching product stats:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
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
  dailyProductLogByUser,
  getProductStats,
};
