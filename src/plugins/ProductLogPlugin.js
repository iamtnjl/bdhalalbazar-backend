const mongoose = require("mongoose");

module.exports = function auditLogPlugin(schema, options) {
  const { logModelName = "AuditLog", userField = "updatedBy" } = options || {};

  if (!schema.paths[userField]) {
    schema.add({
      [userField]: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    });
  }

  function getRefModel(path) {
    const pathSchema = schema.path(path);
    if (!pathSchema) return null;

    if (pathSchema.instance === "ObjectID" && pathSchema.options?.ref) {
      return pathSchema.options.ref;
    }

    if (pathSchema.instance === "Array" && pathSchema.caster?.options?.ref) {
      return pathSchema.caster.options.ref;
    }

    return null;
  }

  function findChanges(original, updated, pathPrefix = "") {
    const changes = [];

    for (const key of Object.keys(updated)) {
      if (["createdAt", "updatedAt", "__v"].includes(key)) continue;

      const oldValue = original?.[key];
      const newValue = updated[key];
      const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      if (Array.isArray(newValue)) {
        if (JSON.stringify(oldValue || []) !== JSON.stringify(newValue)) {
          changes.push({
            field: currentPath,
            oldValue: oldValue || [],
            newValue,
          });
        }
      } else if (
        newValue &&
        typeof newValue === "object" &&
        !mongoose.isValidObjectId(newValue)
      ) {
        changes.push(...findChanges(oldValue || {}, newValue, currentPath));
      } else {
        if (oldValue?.toString() !== newValue?.toString()) {
          changes.push({
            field: currentPath,
            oldValue,
            newValue,
          });
        }
      }
    }

    return changes;
  }

  schema.pre("save", async function (next) {
    const isNew = this.isNew;

    if (isNew) {
      // Only log the create action — no changes array needed
      const AuditLog = mongoose.model(logModelName);
      await AuditLog.create({
        refId: this._id,
        refModel: this.constructor.modelName,
        changedBy: this[userField],
        action: "create",
        changes: [], // optional — you can store some snapshot if you want
      });
      return next();
    }

    // For update
    const original = await this.constructor.findById(this._id).lean();
    const updated = this.toObject();

    const changes = findChanges(original || {}, updated);

    if (changes.length > 0) {
      const AuditLog = mongoose.model(logModelName);

      await AuditLog.create({
        refId: this._id,
        refModel: this.constructor.modelName,
        changedBy: this[userField],
        action: "update",
        changes,
      });
    }

    next();
  });
};
