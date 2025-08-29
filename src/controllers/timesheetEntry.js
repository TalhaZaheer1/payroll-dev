const PayrollTimesheetEntryModel = require("../models/PayrollTimesheetEntry");
const GlobalsModel = require("../models/Globals");
const AuditTrailEntryModel = require("../models/AuditTrailEntry");
const EmployeeModel = require("../models/Employee")

// function parseTimesheetEntry(timesheetEntry) {
//   const result = {};
//   const employee = timesheetEntry.employee;
//   result.employeeName = employee.employeeName;
//
//   result.payRollData = timesheetEntry.payrollData.map((prData) => {
//     let am, mid, pm, lt;
//     // AM
//     if (prData?.am) {
//       am = "P";
//     } else if ((employee?.amRate ?? 0) <= 0) {
//       am = "";
//     } else {
//       am = "A";
//     }
//     // MID
//     if (prData?.mid) {
//       mid = "P";
//     } else if ((employee?.midRate ?? 0) <= 0) {
//       mid = "";
//     } else {
//       mid = "A";
//     }
//     // PM
//     if (prData?.pm) {
//       pm = "P";
//     } else if ((employee?.pmRate ?? 0) <= 0) {
//       pm = "";
//     } else {
//       pm = "A";
//     }
//     // LT
//     if (prData?.lt) {
//       lt = "P";
//     } else if ((employee?.ltRate ?? 0) <= 0) {
//       lt = "";
//     } else {
//       lt = "A";
//     }
//
//     return {
//       payPeriodDate: prData.payPeriodDate,
//       attendence: `${am}/${mid}/${pm}/${lt}`,
//     };
//   });
//
//   result.totalDays = timesheetEntry.totalDays;
//   result.payRate =
//     employee.amRate + employee.midRate + employee.pmRate + employee.ltRate;
//   result.cash = (employee.cashSplitPercent / 100) * result.payRate;
//   result.payroll = result.payRate - result.cash;
//   result.total = result.totalDays * result.payRate;
//   result.notes = timesheetEntry.notes;
//
//   return result;
// }

function roundTo(num, decimals = 2) {
  const p = Math.pow(10, decimals);
  const shifted = num * p;
  const rounded = Math.round(shifted);
  return +`${rounded / p}`; // convert to string then Number
}

function recomputeTotals(timesheetEntry, employee) {
  const INCREMENT_CODES = new Set(["P"]);
  const SHIFTS = ["am", "mid", "pm", "lt"];

  // Ensure increment value exists and is numeric
  const inc = Number(employee?.dayIncrementValue ?? 0);
  if (!inc || inc <= 0) {
    // If you prefer to enforce it strictly, throw instead:
    // throw new Error("dayIncrementValue must be > 0 for this employee");
    timesheetEntry.totalDays = 0;
    timesheetEntry.total = 0;
    return;
  }

  let totalUnits = 0;
  let totalShifts = 0;

  // payrollData is a Map<string, DayEntry>
  timesheetEntry.payrollData.forEach((dayEntry) => {
    if (!dayEntry) return;
    let matches = 0;
    for (const slot of SHIFTS) {
      const val = dayEntry[slot];
      if (INCREMENT_CODES.has(val)) matches += 1;
    }
    if (matches > 0) {
      totalUnits += matches * inc;
      totalShifts += matches;
    }
  });

  // Snap near-integers (e.g., 0.76..0.99) up to whole day
  const fraction = totalUnits % 1;
  if (fraction > 0.7) totalUnits = roundTo(totalUnits, 1);

  timesheetEntry.totalDays = totalUnits;
  timesheetEntry.totalShifts = totalShifts;

  // Recompute monetary totals from payRate
  timesheetEntry.total =
    timesheetEntry.totalDays * (timesheetEntry.payRate || 0);
  timesheetEntry.cash =
    (employee.cashSplitPercent / 100) * timesheetEntry.total;
  timesheetEntry.payroll = timesheetEntry.total - timesheetEntry.cash;
}

async function getCurrentPayPeriodTimesheet(req, res, next) {
  try {
    const globals = await GlobalsModel.find({});
    const currentPayPeriodId = globals[0].currentPayPeriod;
    const currentTimesheetEntries = await PayrollTimesheetEntryModel.find({
      payPeriod: currentPayPeriodId,
    });

    res.json({ timesheetEntries: currentTimesheetEntries });
  } catch (error) {
    next(error);
  }
}

async function getTimesheetByPayPeriod(req, res, next) {
  const payPeriodId = req.params.payPeriodId;

  try {
    if (!payPeriodId) return res.status(400).json({ message: "Pay Period ID is required" });

    // 1) Get entries for this pay period (keep a stable base order)
    const entries = await PayrollTimesheetEntryModel
      .find({ payPeriod: payPeriodId })
      .sort({ _id: 1 })
      .lean();

    // 2) Fetch employee docs to know which entries are Drivers and who their Aid is
    const empIds = entries.map(e => e.employeeId).filter(Boolean);
    const employees = await EmployeeModel
      .find({ _id: { $in: empIds } }, "_id position aid")
      .lean();

    // 3) Quick lookup maps
    const empById = new Map(employees.map(e => [String(e._id), e]));
    const entryByEmpId = new Map(entries.map(e => [String(e.employeeId), e]));

    // 4) Build ordered list: Driver -> (its Aid if present), then leftovers
    const visited = new Set(); // by employeeId string
    const ordered = [];

    // First pass: place Drivers and their Aids (keep original driver order)
    for (const entry of entries) {
      const empId = String(entry.employeeId);
      if (visited.has(empId)) continue;

      // Prefer schema position, fallback to entry field
      const emp = empById.get(empId);
      const isDriver =
        (entry.employeePosition === "Driver") ||
        (emp && emp.position === "Driver");

      if (isDriver) {
        // Push driver
        ordered.push(entry);
        visited.add(empId);

        // If driver has an aid and that aid has an entry, place aid right after
        const aidId = emp?.aid ? String(emp.aid) : null;
        if (aidId) {
          const aidEntry = entryByEmpId.get(aidId);
          if (aidEntry && !visited.has(aidId)) {
            ordered.push(aidEntry);
            visited.add(aidId);
          }
        }
      }
    }

    // Second pass: append any entries not yet added (standalone Aids / others)
    for (const entry of entries) {
      const empId = String(entry.employeeId);
      if (!visited.has(empId)) {
        ordered.push(entry);
        visited.add(empId);
      }
    }

    return res.json({ timesheetEntries: ordered });
  } catch (error) {
    next(error);
  }
}

async function deleteTimesheetEntryById(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id required" });

    const deleted = await PayrollTimesheetEntryModel.findByIdAndDelete(id);
    if (!deleted)
      return res.status(404).json({ message: "Timesheet entry not found" });

    return res.json({ message: "Timesheet entry deleted", id });
  } catch (e) {
    next(e);
  }
}

// OPTIONAL: DELETE /timesheet/by-employee/:employeeId/:payPeriodId
async function deleteTimesheetByEmployeeAndPeriod(req, res, next) {
  try {
    const { employeeId, payPeriodId } = req.params;
    if (!employeeId || !payPeriodId)
      return res
        .status(400)
        .json({ message: "employeeId and payPeriodId required" });

    const result = await PayrollTimesheetEntryModel.deleteMany({
      employeeId,
      payPeriod: payPeriodId,
    });
    return res.json({
      message: "Deleted entries",
      deletedCount: result.deletedCount,
    });
  } catch (e) {
    next(e);
  }
}
async function updateTimesheetEntry(req, res, next) {
  const { employeeId, payrollDataKey, fieldName, fieldValue } = req.body;
  console.log({ employeeId });
  try {
    const allowedFieldNames = ["am", "pm", "mid", "lt"];
    const allowedFieldValues = ["A", "P", "E", "S", "V"];

    if (!allowedFieldNames.includes(fieldName))
      throw new Error(`Invalid field name: ${fieldName}`);
    if (!allowedFieldValues.includes(fieldValue))
      throw new Error(`Invalid field value: ${fieldValue}`);

    const globals = await GlobalsModel.find({});
    const currentPayPeriodId = globals[0].currentPayPeriod;
    const timesheetEntry = await PayrollTimesheetEntryModel.findOne({
      payPeriod: currentPayPeriodId,
      employeeId: employeeId,
    }).populate("employeeId");

    const employee = timesheetEntry.employeeId;
    if (!employee)
      throw new Error("Employee does not exist. Cannot modify this record");

    console.log({ rate: employee[`${fieldName}Rate`] });

    if (employee[`${fieldName}Rate`] <= 0)
      throw new Error(`${fieldName}Rate not set for this employee`);

    const oldPayrollData = timesheetEntry.payrollData.get(payrollDataKey);
    oldPayrollData[fieldName] = fieldValue;
    timesheetEntry.payrollData.set(payrollDataKey, {
      ...oldPayrollData,
    });
    timesheetEntry.markModified("payrollData");

    recomputeTotals(timesheetEntry, employee);

    await createAuditTrail(timesheetEntry, fieldName, fieldValue);
    const updatedTimesheetEntry = await timesheetEntry.save();
    updatedTimesheetEntry.employeeId = updatedTimesheetEntry.employeeId._id;
    res.json({ updatedTimesheetEntry });
  } catch (error) {
    next(error);
  }
}

async function createAuditTrail(timesheetEntry, fieldName, fieldValue) {
  const employee = timesheetEntry.employeeId;
  const auditTrailPayload = {
    timesheetEntry: timesheetEntry._id,
    changeDetails: {
      fieldName,
      fieldValue,
    },
    payPeriod: timesheetEntry.payPeriod,
    timesheetEntryDetails: {
      totalDays: timesheetEntry.totalDays,
      total: timesheetEntry.total,
    },
    employeeDetails: {
      name: employee.employeeName,
      id: employee._id,
    },
  };
  await AuditTrailEntryModel.create(auditTrailPayload);
}

module.exports = {
  getCurrentPayPeriodTimesheet,
  updateTimesheetEntry,
  getTimesheetByPayPeriod,
  deleteTimesheetEntryById,
  deleteTimesheetByEmployeeAndPeriod,
};
