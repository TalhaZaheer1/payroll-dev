const mongoose = require("mongoose")

const payPeriodSchema = new mongoose.Schema({
  startDate: {
    type:Date,
    required:true
  },
  endDate:{
    type:Date,
    required:true
  }
},{timestamps:true});

module.exports = mongoose.model("PayPeriod",payPeriodSchema);
