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

// ===== Timesheet helpers =====
async function createTimesheetEntry(employee) {
  const globals = await GlobalModel.find({});
  if (globals.length < 1) return;
  const currentPayPeriodId = globals[0].currentPayPeriod;
  const payPeriodDays = await PayPeriodDayModel.find({
    payPeriod: currentPayPeriodId,
  });

  const payrollData = {};
  payPeriodDays.forEach((ppd) => {
    const key = toUTCDateKey(ppd.date);
    payrollData[key] = {
      payPeriodDate: { dayName: ppd.dayName, date: ppd.date },
      am: "",
      mid: "",
      pm: "",
      lt: "",
    };
  });

  const payRate =
    employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;
  const cash = (employee.cashSplitPercent / 100) * payRate;

  await PayrollTimesheetEntryModel.create({
    payPeriod: currentPayPeriodId,
    employeeName: employee.employeeName,
    employeeId: employee._id,
    employeePosition: employee.position,
    payrollData,
    payRate,
    cash,
    payroll: payRate - cash,
  });
}

async function updateTimesheetEntry(employee) {
  const globals = await GlobalModel.find({});
  if (globals.length < 1) return;
  const currentPayPeriodId = globals[0].currentPayPeriod;

  const payRate =
    employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;

  const timesheetEntry = await PayrollTimesheetEntryModel.findOne({
    $or: [{ employee: employee._id }, { employeeId: employee._id }],
    payPeriod: currentPayPeriodId,
  });

  if (!timesheetEntry) return;

  const payload = {
    payRate,
    employeePosition:employee.position
  };

  if (timesheetEntry && typeof timesheetEntry.totalDays === "number") {
    payload.total = timesheetEntry.totalDays * payRate;
    payload.cash = (employee.cashSplitPercent / 100) * payload.total;
    payload.payroll = payload.total - payload.cash;
  }

  await PayrollTimesheetEntryModel.findOneAndUpdate(
    {
      $or: [{ employee: employee._id }, { employeeId: employee._id }],
      payPeriod: currentPayPeriodId,
    },
    payload,
  );
}

// ===== CRUD =====

// GET /employee
async function getAllEmployees(req, res, next) {
  try {
    const employees = await EmployeeModel.find({}).populate("aid").lean();
    res.json({ employees });
  } catch (error) {
    next(error);
  }
}

// POST /employee/add
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
      "isActive",
      "aid",
    ];
    const data = pick(req.body, allowed);

    // Coerce numerics
    data.amRate = toNum(data.amRate) || 0;
    data.midRate = toNum(data.midRate) || 0;
    data.pmRate = toNum(data.pmRate) || 0;
    data.ltRate = toNum(data.ltRate) || 0;
    data.cashSplitPercent = toNum(data.cashSplitPercent);

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
      rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2));

    if (
      isNaN(data.cashSplitPercent) ||
      data.cashSplitPercent < 0 ||
      data.cashSplitPercent > 100
    ) {
      return res
        .status(400)
        .json({ message: "Cash split % must be between 0 and 100" });
    }

    if (data.aid) {
      const aidConnection = await EmployeeModel.findOne({
        position: "Driver",
        aid: data.aid,
      });
      if (aidConnection)
        throw new Error(
          `This aid is already connected to another driver named:${aidConnection.employeeName}`,
        );
    }

    const created = await EmployeeModel.create(data);
    if (created.isActive) await createTimesheetEntry(created);
    return res.status(201).json(created);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Employee name must be unique" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

// POST /employee/bulk
async function createEmployeesBulk(req, res, next) {
  try {
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

      data.amRate = toNum(data.amRate) || 0;
      data.midRate = toNum(data.midRate) || 0;
      data.pmRate = toNum(data.pmRate) || 0;
      data.ltRate = toNum(data.ltRate) || 0;
      data.cashSplitPercent = toNum(data.cashSplitPercent);

      if (!data.employeeName || !data.position) {
        errors.push({
          index: idx,
          message: "employeeName and position are required",
        });
        return;
      }

      const ratesArr = [data.amRate, data.midRate, data.pmRate, data.ltRate];
      if (ratesArr.some((n) => isNaN(n) || n < 0)) {
        errors.push({ index: idx, message: "Rates cannot be negative" });
        return;
      }

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

      const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
      data.dayIncrementValue =
        rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2));

      docs.push(data);
    });

    if (docs.length === 0) {
      return res.status(400).json({
        message: "No valid employee records to insert",
        failedCount: errors.length,
        failed: errors,
      });
    }

    let inserted = [];
    try {
      inserted = await EmployeeModel.insertMany(docs, { ordered: false });
    } catch (e) {
      if (e?.insertedDocs) inserted = e.insertedDocs;
      if (e?.writeErrors?.length) {
        e.writeErrors.forEach((we) => {
          errors.push({
            index: we?.index ?? -1,
            message: "Employee name must be unique",
          });
        });
      }
    }

    for await (const doc of inserted) {
      if (doc.isActive) await createTimesheetEntry(doc);
    }

    const partial = errors.length > 0;
    return res.status(partial ? 207 : 201).json({
      message: partial
        ? "Bulk insert completed with some errors"
        : "Bulk insert successful",
      insertedCount: inserted.length,
      failedCount: errors.length,
      failed: errors,
      inserted,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Duplicate employee name in bulk payload" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

// PUT /employee/:id
async function updateEmployee(req, res, next) {
  try {
    const { id } = req.params;

    const allowed = [
      "employeeName",
      "position",
      "amRate",
      "midRate",
      "pmRate",
      "ltRate",
      "cashSplitPercent",
      "isActive",
      "aid",
    ];
    const update = pick(req.body, allowed);

    if (update.amRate !== undefined) update.amRate = toNum(update.amRate);
    if (update.midRate !== undefined) update.midRate = toNum(update.midRate);
    if (update.pmRate !== undefined) update.pmRate = toNum(update.pmRate);
    if (update.ltRate !== undefined) update.ltRate = toNum(update.ltRate);
    if (update.cashSplitPercent !== undefined)
      update.cashSplitPercent = toNum(update.cashSplitPercent);

    const { amRate, midRate, pmRate, ltRate, cashSplitPercent } = update;
    const ratesArr = [amRate, midRate, pmRate, ltRate];

    if (ratesArr.some((n) => n !== undefined && (isNaN(n) || n < 0))) {
      return res.status(400).json({ message: "Rates cannot be negative" });
    }

    const rateCount = ratesArr.reduce((acc, n) => acc + (n > 0 ? 1 : 0), 0);
    update.dayIncrementValue =
      rateCount === 0 ? 0 : Number((1 / rateCount).toFixed(2));

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

    const employee = await EmployeeModel.findById(id);

    if (update.position === "Driver" && employee.position === "Aid") {
      await EmployeeModel.findOneAndUpdate({ aid: id }, { aid: null });
    }

    if (update.aid) {
      const aidConnection = await EmployeeModel.findOne({
        position: "Driver",
        aid: update.aid,
      });
      if (aidConnection && aidConnection._id !== id)
        throw new Error(
          `This aid is already connected to another driver named:${aidConnection.employeeName}`,
        );
    }

    const updated = await EmployeeModel.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!updated)
      return res.status(404).json({ message: "Employee not found" });

    if (updated.isActive) await updateTimesheetEntry(updated);

    return res.json({
      message: "Employee updated successfully",
      employee: updated,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Employee name must be unique" });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

async function getAllAids(req, res, next) {
  try {
    const aids = await EmployeeModel.find({ position: "Aid" });
    res.json({ aids });
  } catch (error) {
    next(error);
  }
}

// DELETE /employee/:id
async function deleteEmployee(req, res, next) {
  try {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ message: "Employee id is required" });

    const deleted = await EmployeeModel.findByIdAndDelete(id);
    if (!deleted)
      return res.status(404).json({ message: "Employee not found" });

    // remove related timesheet entries
    // await PayrollTimesheetEntryModel.deleteMany({ $or: [{ employeeId: id }, { employee: id }] });

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

// POST /employee/bulk-delete
async function deleteEmployeesBulk(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length)
      return res.status(400).json({ message: "Provide ids: string[]" });

    const delEmp = await EmployeeModel.deleteMany({ _id: { $in: ids } });
    // clean related timesheets
    const delSheets = await PayrollTimesheetEntryModel.deleteMany({
      $or: [{ employeeId: { $in: ids } }, { employee: { $in: ids } }],
    });

    return res.json({
      message: "Bulk delete completed",
      deletedCount: delEmp.deletedCount,
      timesheetDeletedCount: delSheets.deletedCount,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllEmployees,
  createEmployee,
  updateEmployee,
  createEmployeesBulk,
  deleteEmployee,
  deleteEmployeesBulk,
  getAllAids,
};
