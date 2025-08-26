const mongoose = require("mongoose");

const globalsSchema = new mongoose.Schema({
 currentPayPeriod:{
    type:mongoose.Types.ObjectId,
    ref:"PayPeriod"
  }
})

module.exports = mongoose.model("Globals", globalsSchema);
 
