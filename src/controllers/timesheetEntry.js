const PayrollTimesheetEntryModel = require("../models/PayrollTimesheetEntry");
const GlobalsModel = require("../models/Globals");
const AuditTrailEntryModel = require("../models/AuditTrailEntry");

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
  const INCREMENT_CODES = new Set(["P", "E", "S"]);
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
    }
  });


  // Snap near-integers (e.g., 0.76..0.99) up to whole day
  const fraction = totalUnits % 1;
  if (fraction > 0.70) totalUnits = roundTo(totalUnits,1);

  timesheetEntry.totalDays = totalUnits;

  // Recompute monetary totals from payRate
  timesheetEntry.total =
    timesheetEntry.totalDays * (timesheetEntry.payRate || 0);
}

async function getCurrentPayPeriodTimesheet(req, res, next) {
  try {
    const globals = await GlobalsModel.find({});
    const currentPayPeriodId = globals[0].currentPayPeriod;
    const currentTimesheetEntries = await PayrollTimesheetEntryModel.find({
      payPeriod: currentPayPeriodId,
    })

    res.json({ timesheetEntries: currentTimesheetEntries });
  } catch (error) {
    next(error);
  }
}

async function getTimesheetByPayPeriod(req, res, next) {
  const payPeriodId = req.params.payPeriodId;
  try {
    if (!payPeriodId) throw new Error("Pay Period ID is required");
    const timesheetEntries = await PayrollTimesheetEntryModel.find({
      payPeriod: payPeriodId,
    })
    res.json({ timesheetEntries });
  } catch (error) {
    next(error);
  }
}

async function updateTimesheetEntry(req, res, next) {
  const { employeeId, payrollDataKey, fieldName, fieldValue } = req.body;
  console.log({employeeId})
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
    await timesheetEntry.save();
    res.json({ success: true });
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
};
