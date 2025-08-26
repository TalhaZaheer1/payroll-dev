const mongoose = require("mongoose");

const dayEntrySchema = new mongoose.Schema(
  {
    payPeriodDate: {
      dayName: { type: String },
      date: { type: Date },
    },
    am: {
      type: String,
      enum: ["A", "P", "E", "S", "V", ""],
      default: "",
    },
    mid: {
      type: String,
      enum: ["A", "P", "E", "S", "V", ""],
      default: "",
    },
    pm: {
      type: String,
      enum: ["A", "P", "E", "S", "V", ""],
      default: "",
    },
    lt: {
      type: String,
      enum: ["A", "P", "E", "S", "V", ""],
      default: "",
    },
  },
  { _id: false }, // don't add _id to each map value
);

const payrollTimesheetEntrySchema = new mongoose.Schema({
  payPeriod: {
    type: mongoose.Types.ObjectId,
    ref: "PayPeriod",
    index: true,
  },
  employeeName: {
    type: String,
    required:true
  },
  employeeId:{
    type:mongoose.Types.ObjectId,
    ref:"Employee",
    required:true
  },
  payrollData: {
    type: Map,
    of: dayEntrySchema,
    default: () => new Map(),
  },
  totalDays: {
    type: Number,
    default: 0,
  },
  payRate: {
    type: Number,
    required: true,
  },
  cash: {
    type: Number,
  },
  payroll: {
    type: Number,
  },
  total: {
    type: Number,
  },
  notes: {
    type: String,
  },
});

module.exports = mongoose.model(
  "PayrollTimesheetEntry",
  payrollTimesheetEntrySchema,
);
