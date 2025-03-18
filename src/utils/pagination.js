const paginate = async (
  model,
  query = {},
  req,
  populateFields = [],
  sort = { createdAt: -1 },
  aliasFields = {} // New: Field alias mapping (e.g., { "items._id": "items.product" })
) => {
  if (!model || typeof model.countDocuments !== "function") {
    throw new Error("Invalid model provided to pagination function.");
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.show) || 20;
  const skip = (page - 1) * limit;

  // Count total documents
  const totalCount = await model.countDocuments(query);

  // Build query with sorting
  let resultsQuery = model.find(query).skip(skip).limit(limit).sort(sort);

  // Handle population (supports deep population like `items._id`)
  if (populateFields.length > 0) {
    populateFields.forEach((field) => {
      // Check if an alias is provided for this field
      const alias = aliasFields[field] || field;

      if (field.includes("._id")) {
        const parentField = field.split("._id")[0];

        resultsQuery = resultsQuery.populate({
          path: parentField, // Populate the entire parent field (e.g., `items`)
          populate: {
            path: "_id", // Inside `items`, populate `_id`
            model: "Product", // Reference the `Product` model
            select: "-__v", // Exclude unnecessary fields
          },
        });
      } else {
        resultsQuery = resultsQuery.populate(field);
      }
    });
  }

  // Execute query
  let results = await resultsQuery.lean(); // Ensure results are plain JSON

  // Rename populated fields dynamically
  results = results.map((doc) => {
    let docObj = { ...doc };

    Object.keys(aliasFields).forEach((originalField) => {
      const alias = aliasFields[originalField];

      if (originalField.includes("._id")) {
        const parentField = originalField.split("._id")[0];

        if (docObj[parentField] && Array.isArray(docObj[parentField])) {
          docObj[parentField] = docObj[parentField].map((item) => {
            if (item._id && typeof item._id === "object") {
              return {
                ...item,
                [alias.split(".").pop()]: item._id, // Rename `_id` to `product`
                _id: undefined, // Remove `_id`
              };
            }
            return item;
          });
        }
      }
    });

    return docObj;
  });

  // Generate pagination links
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

  return {
    count: totalCount,
    next: nextPage,
    previous: prevPage,
    results,
  };
};

module.exports = paginate;
