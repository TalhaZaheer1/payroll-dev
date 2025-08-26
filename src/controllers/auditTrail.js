const AuditTrailEntry = require("../models/AuditTrailEntry");

/**
 * GET /audit-trail
 * Query params:
 *  - page (number, default 1)
 *  - limit (number, default 20, max 100)
 *  - payPeriod (ObjectId as string)      // optional filter
 *  - employeeId (string)                 // optional filter (stored in employeeDetails.id)
 *  - timesheetEntryId (ObjectId string)  // optional filter
 *  - sort ("asc" | "desc", default "desc") // by createdAt
 */
async function listAuditTrail(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      payPeriod,
      employeeId,
      timesheetEntryId,
      sort = "desc",
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = {};
    if (payPeriod) filter.payPeriod = payPeriod;
    if (employeeId) filter["employeeDetails.id"] = employeeId;
    if (timesheetEntryId) filter.timesheetEntry = timesheetEntryId;

    const [items, total] = await Promise.all([
      AuditTrailEntry.find(filter)
        .sort({ createdAt: sortOrder, _id: sortOrder }) // stable sort
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        // populate if you want more context; keep light to avoid perf issues
        // .populate("timesheetEntry", "_id employee payPeriod totalDays total")
        // .populate("payPeriod", "_id startDate endDate")
        .lean(),
      AuditTrailEntry.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      page: pageNum,
      limit: limitNum,
      sort: sortOrder === -1 ? "desc" : "asc",
      total,
      totalPages,
      hasPrevPage: pageNum > 1,
      hasNextPage: pageNum < totalPages,
      data: items,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAuditTrail };
