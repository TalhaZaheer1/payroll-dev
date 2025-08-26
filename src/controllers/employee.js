const EmployeeModel = require("../models/Employee");
const GlobalModel = require("../models/Globals");
const PayPeriodDayModel = require("../models/PayPeriodDay");
const PayrollTimesheetEntryModel = require("../models/PayrollTimesheetEntry");

// Helpers
const toNum = (v) =>
  v === "" || v === null || v === undefined ? NaN : Number(v);
const pick = (obj, keys) =>
  keys.reduce(
    (acc, k) => (obj[k] !== undefined ? ((acc[k] = obj[k]), acc) : acc),
    {},
  );
const toUTCDateKey = (d) =>
  (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10); // 'YYYY-MM-DD'

async function createTimesheetEntry(employee) {
  const globals = await GlobalModel.find({});
  if (globals.length < 1) return;
  const currentPayPeriodId = globals[0].currentPayPeriod;
  const payPeriodDays = await PayPeriodDayModel.find({
    payPeriod: currentPayPeriodId,
  });
  // Use a plain object (Mongoose will cast to Map if schema type is Map)
  const payrollData = {};

  payPeriodDays.forEach((ppd) => {
    const key = toUTCDateKey(ppd.date); // e.g., '2025-08-25'
    payrollData[key] = {
      payPeriodDate: {
        dayName: ppd.dayName,
        date: ppd.date, // keep as Date; Mongoose will store it correctly
      },
      am: "",
      mid: "",
      pm: "",
      lt: "",
    };
  });

  const payRate =
    employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;
  const cash = (employee.cashSplitPercent / 100) * payRate;
  const timesheetEntryPayload = {
    payPeriod: currentPayPeriodId,
    employeeName: employee.employeeName,
    employeeId:employee._id,
    payrollData,
    payRate,
    cash,
    payroll: payRate - cash,
  };
  await PayrollTimesheetEntryModel.create(timesheetEntryPayload);
}

async function updateTimesheetEntry(employee) {
  const globals = await GlobalModel.find({});
  if (globals.length < 1) return;
  const currentPayPeriodId = globals[0].currentPayPeriod;
  const payRate =
    employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;
  const cash = (employee.cashSplitPercent / 100) * payRate;
  const timesheetEntryPayload = {
    payRate,
    cash,
    payroll: payRate - cash,
  };
  const timesheetEntry = await PayrollTimesheetEntryModel.findOne({
    employee: employee._id,
    payPeriod: currentPayPeriodId,
  });
  timesheetEntryPayload.total =
    timesheetEntry.totalDays * timesheetEntry.payRate;
  await PayrollTimesheetEntryModel.findOneAndUpdate(
    { employee: employee._id, payPeriod: currentPayPeriodId },
    timesheetEntryPayload,
  );
}

// DELETE /employees/:id
async function deleteEmployee(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Employee id is required" });

    const deleted = await EmployeeModel.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Employee not found" });

    return res.json({
      message: "Employee deleted successfully",
      employeeId: id,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    next(error);
  }
}

// GET /employees
async function getAllEmployees(req, res, next) {
  try {
    const employees = await EmployeeModel.find({}).lean();
    res.json({ employees });
  } catch (error) {
    next(error);
  }
}

// POST /employees/add
async function createEmployee(req, res, next) {
  try {
    const allowed = [
      "employeeName",
      "position",
      "amRate",
      "midRate",
      "pmRate",
      "ltRate",
      "cashSplitPercent",
    ];
    const data = pick(req.body, allowed);

    // Coerce numeric fields
    data.amRate = toNum(data.amRate) || 0;
    data.midRate = toNum(data.midRate) || 0;
    data.pmRate = toNum(data.pmRate) || 0;
    data.ltRate = toNum(data.ltRate) || 0;
    data.cashSplitPercent = toNum(data.cashSplitPercent);

    // Basic validations mirroring frontend
    if (!data.employeeName || !data.position) {
      return res
        .status(400)
        .json({ message: "employeeName and position are required" });
    }
    const ratesArr = [data.amRate, data.midRate, data.pmRate, data.ltRate];

    if (ratesArr.some((n) => isNaN(n) || n < 0)) {
      return res.status(400).json({ message: "Rates cannot be negative" });
    }

    const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
    data.dayIncrementValue =
      rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2)); // 1→1, 2→0.5, 3→0.33, 4→0.25

    if (
      isNaN(data.cashSplitPercent) ||
      data.cashSplitPercent < 0 ||
      data.cashSplitPercent > 100
    ) {
      return res
        .status(400)
        .json({ message: "Cash split % must be between 0 and 100" });
    }

    const created = await EmployeeModel.create(data);
    await createTimesheetEntry(created);
    // Frontend expects the created employee object directly
    return res.status(201).json(created);
  } catch (error) {
    // Handle duplicate or validation errors cleanly
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

// POST /employees/bulk
async function createEmployeesBulk(req, res, next) {
  try {
    // Accept either { employees: [...] } or raw array body [...]
    const input = Array.isArray(req.body?.employees)
      ? req.body.employees
      : Array.isArray(req.body)
        ? req.body
        : null;

    if (!input || input.length === 0) {
      return res.status(400).json({
        message:
          "Provide an array of employees in the request body, e.g. { employees: [...] } or [...].",
      });
    }

    const allowed = [
      "employeeName",
      "position",
      "amRate",
      "midRate",
      "pmRate",
      "ltRate",
      "cashSplitPercent",
    ];

    const errors = [];
    const docs = [];

    input.forEach((raw, idx) => {
      const data = pick(raw, allowed);

      // Coerce numerics (matching your single-create defaults)
      data.amRate = toNum(data.amRate) || 0;
      data.midRate = toNum(data.midRate) || 0;
      data.pmRate = toNum(data.pmRate) || 0;
      data.ltRate = toNum(data.ltRate) || 0;
      data.cashSplitPercent = toNum(data.cashSplitPercent);

      // Required text fields
      if (!data.employeeName || !data.position) {
        errors.push({
          index: idx,
          message: "employeeName and position are required",
        });
        return;
      }

      const ratesArr = [data.amRate, data.midRate, data.pmRate, data.ltRate];

      // Rates validation
      if (ratesArr.some((n) => isNaN(n) || n < 0)) {
        errors.push({ index: idx, message: "Rates cannot be negative" });
        return;
      }

      // Cash split validation
      if (
        isNaN(data.cashSplitPercent) ||
        data.cashSplitPercent < 0 ||
        data.cashSplitPercent > 100
      ) {
        errors.push({
          index: idx,
          message: "Cash split % must be between 0 and 100",
        });
        return;
      }

      // Compute dayIncrementValue based on number of positive rates
      // (Fixes the small bug in the loop from your single-create example)
      const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
      data.dayIncrementValue =
        rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2)); // 1→1, 2→0.5, 3→0.33, 4→0.25

      docs.push(data);
    });

    // If nothing valid, fail fast
    if (docs.length === 0) {
      return res.status(400).json({
        message: "No valid employee records to insert",
        failedCount: errors.length,
        failed: errors,
      });
    }

    // Insert valid docs (unordered so one bad doc won't stop others)
    const inserted = await EmployeeModel.insertMany(docs, { ordered: false });
    for await (const doc of inserted) {
      await createTimesheetEntry(doc);
    }
    // 201 if all good, 207 if partial success
    const partial = errors.length > 0;
    return res.status(partial ? 207 : 201).json({
      message: partial
        ? "Bulk insert completed with some errors"
        : "Bulk insert successful",
      insertedCount: inserted.length,
      failedCount: errors.length,
      failed: errors, // [{ index, message }]
      inserted, // array of created employee docs
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

// PUT /employees/:id
async function updateEmployee(req, res, next) {
  try {
    const { id } = req.params;

    // Build update payload (only allow known fields)
    const allowed = [
      "employeeName",
      "position",
      "amRate",
      "midRate",
      "pmRate",
      "ltRate",
      "cashSplitPercent",
    ];
    const update = pick(req.body, allowed);

    // Coerce numeric fields if present
    if (update.amRate !== undefined) update.amRate = toNum(update.amRate);
    if (update.midRate !== undefined) update.midRate = toNum(update.midRate);
    if (update.pmRate !== undefined) update.pmRate = toNum(update.pmRate);
    if (update.ltRate !== undefined) update.ltRate = toNum(update.ltRate);
    if (update.cashSplitPercent !== undefined)
      update.cashSplitPercent = toNum(update.cashSplitPercent);

    // Validations (only for provided fields)
    const { amRate, midRate, pmRate, ltRate, cashSplitPercent } = update;
    const ratesArr = [amRate, midRate, pmRate, ltRate];

    if (ratesArr.some((n) => n !== undefined && (isNaN(n) || n < 0))) {
      return res.status(400).json({ message: "Rates cannot be negative" });
    }

    const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
    update.dayIncrementValue =
      rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2)); // 1→1, 2→0.5, 3→0.33, 4→0.25

    if (
      cashSplitPercent !== undefined &&
      (isNaN(cashSplitPercent) ||
        cashSplitPercent < 0 ||
        cashSplitPercent > 100)
    ) {
      return res
        .status(400)
        .json({ message: "Cash split % must be between 0 and 100" });
    }

    const updated = await EmployeeModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Employee not found" });
    }

    await updateTimesheetEntry(updated);

    // Your frontend checks res.ok; it doesn't need the body but let's send a message.
    return res.json({
      message: "Employee updated successfully",
      employee: updated,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

module.exports = {
  getAllEmployees,
  createEmployee,
  updateEmployee,
  createEmployeesBulk,
  deleteEmployee
};
