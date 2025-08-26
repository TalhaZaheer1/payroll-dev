const mongoose = require("mongoose");

const auditTrailEntrySchema = new mongoose.Schema({
  timesheetEntry:{
    type:mongoose.Types.ObjectId,
    ref:"PayrollTimesheetEntry",
    required:true
  },
  employeeDetails:{
    name:{
      type:String,
      required:true
    },
    id:{
      type:String,
      required:true
    }
  },
  changeDetails:{
    fieldName:{
      type:String,
      enum:["am","mid","pm","lt"],
      required:true
    },
    fieldValue:{
      type:String,
      enum:["A", "P", "E", "S", "V"],
      required:true
    },
  },
  payPeriod:{
    type:mongoose.Types.ObjectId,
    ref:"PayPeriod",
    required:true
  },
  timesheetEntryDetails:{
    totalDays:Number,
    total:Number
  }
},{timestamps:true})


module.exports = mongoose.model("AuditTrailEntry",auditTrailEntrySchema);
