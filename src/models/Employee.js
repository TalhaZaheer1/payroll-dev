const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    employeeName: {
      type: String,
      required: true,
      maxlength: 255,
      trim: true,
      unique: true, 
    },
    position: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    amRate: { type: Number, required: true, min: 0, default: 0 },
    midRate: { type: Number, required: true, min: 0, default: 0 },
    pmRate: { type: Number, required: true, min: 0, default: 0 },
    ltRate: { type: Number, required: true, min: 0, default: 0 },
    cashSplitPercent: { type: Number, required: true, min: 0, max: 100 },
    dayIncrementValue: { type: Number, min: 0.25 },
  },
  { timestamps: true }
);


module.exports = mongoose.model("Employee", employeeSchema);
