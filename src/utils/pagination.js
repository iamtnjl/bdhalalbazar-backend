const paginate = async (
  model,
  query,
  req,
  populateFields = [],
  sort = { createdAt: -1 }
) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.show) || 20;
  const skip = (page - 1) * limit;

  // Sorting (Use "sort_by" from API)
  let sort_by = sort;

  const totalCount = await model.countDocuments(query);

  // Fetch paginated results with sorting and optional population
  let resultsQuery = model.find(query).skip(skip).limit(limit).sort(sort_by);

  if (populateFields.length > 0) {
    populateFields.forEach((field) => {
      resultsQuery = resultsQuery.populate(field);
    });
  }

  const results = await resultsQuery;

  // Construct pagination links
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
