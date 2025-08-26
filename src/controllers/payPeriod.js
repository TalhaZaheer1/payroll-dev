const PayPeriodModel = require("../models/PayPeriod");
const PayPeriodDayModel = require("../models/PayPeriodDay");
const EmployeeModel = require("../models/Employee");
const PayrollTimesheetEntryModel = require("../models/PayrollTimesheetEntry");
const GlobalsModel = require("../models/Globals");

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

async function createNewPayPeriod(req, res, next) {
  const { startDate } = req.body;

  try {
    if (!startDate) {
      return res.status(400).json({ message: "startDate is required" });
    }

    // Parse and normalize to a UTC midnight baseline
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({ message: "Invalid startDate" });
    }

    // Must be Monday (UTC to avoid TZ skew when client sends "YYYY-MM-DD")
    if (start.getUTCDay() !== 1) {
      return res.status(400).json({ message: "startDate must be a Monday" });
    }

    const endDate = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    // Add offset days in UTC
    endDate.setUTCDate(endDate.getUTCDate() + 11);

    const newPayPeriod = await PayPeriodModel.create({
      startDate: start,
      endDate,
    });

    // Offsets for Mon–Fri in week 1 and Mon–Fri in week 2
    // (skip Sat/Sun by jumping +7 after Friday)
    const offsets = [0, 1, 2, 3, 4, 7, 8, 9, 10, 11];

    const payPeriodDaysPayload = offsets.map((offset) => {
      // Base at UTC midnight of start date
      const base = new Date(
        Date.UTC(
          start.getUTCFullYear(),
          start.getUTCMonth(),
          start.getUTCDate(),
        ),
      );
      // Add offset days in UTC
      base.setUTCDate(base.getUTCDate() + offset);

      return {
        dayName: DAY_NAMES[base.getUTCDay()], // "Monday", "Tuesday", ...
        date: base, // Date object at UTC midnight
        payPeriod: newPayPeriod._id,
      };
    });

    const newPayPeriodDays =
      await PayPeriodDayModel.insertMany(payPeriodDaysPayload);

    const globals = await GlobalsModel.find({});
    if (globals.length < 1) {
      await GlobalsModel.create({
        currentPayPeriod: newPayPeriod._id,
      });
    } else {
      await GlobalsModel.findByIdAndUpdate(globals[0]._id, {
        currentPayPeriod: newPayPeriod._id,
      });
    }

    const employees = await EmployeeModel.find(
      {},
      "_id employeeName amRate midRate pmRate ltRate cashSplitPercent",
    );

    // helper
    const toUTCDateKey = (d) =>
      (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // ...
    const payrollTimesheetEntriesPayload = employees.map((employee) => {
      // Use a plain object (Mongoose will cast to Map if schema type is Map)
      const payrollData = {};

      newPayPeriodDays.forEach((ppd) => {
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
        (employee.amRate || 0) +
        (employee.midRate || 0) +
        (employee.pmRate || 0) +
        (employee.ltRate || 0);

      const cash = ((employee.cashSplitPercent || 0) / 100) * payRate;

      return {
        payPeriod: newPayPeriod._id,
        employeeId: employee._id,
        employeeName:employee.employeeName,
        payrollData, // stable keys
        payRate,
        cash,
        payroll: payRate - cash,
      };
    });


    await PayrollTimesheetEntryModel.insertMany(payrollTimesheetEntriesPayload);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function getAllPayPeriods(req, res, next) {
  try {
    const payPeriods = await PayPeriodModel.find({});
    res.json({ payPeriods });
  } catch (error) {
    next(error);
  }
}

async function getCurrentPayPeriodId(req, res, next) {
  try {
    const globals = await GlobalsModel.find({});
    if (globals.length < 1)
      throw new Error("Nothing set as current pay period");
    res.json({ currentPayPeriodId: globals[0].currentPayPeriod });
  } catch (error) {
    next(error);
  }
}

async function getPayPeriodDetails(req, res, next) {
  const payPeriodId = req.params.payPeriodId;
  try {
    if (!payPeriodId) throw new Error("id required in url");
    const payPeriod = await PayPeriodModel.findById(payPeriodId);
    res.json({ payPeriod });
  } catch (error) {
    next(error);
  }
}

async function getPayPeriodDays(req, res, next) {
  const payPeriodId = req.params.payPeriodId;
  try {
    if (!payPeriodId) throw new Error("payPeriodId required in url");
    const days = await PayPeriodDayModel.find({ payPeriod: payPeriodId });
    res.json({ days });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createNewPayPeriod,
  getAllPayPeriods,
  getCurrentPayPeriodId,
  getPayPeriodDetails,
  getPayPeriodDays,
};
