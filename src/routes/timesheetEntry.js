const {  getCurrentPayPeriodTimesheet,deleteTimesheetEntryById,deleteTimesheetByEmployeeAndPeriod, updateTimesheetEntry, getTimesheetByPayPeriod } = require("../controllers/timesheetEntry")

const router = require("express").Router()

router.get("/",getCurrentPayPeriodTimesheet);
router.put("/",updateTimesheetEntry);
router.get("/:payPeriodId",getTimesheetByPayPeriod);
router.delete("/:id", deleteTimesheetEntryById);

// OPTIONAL: delete by employee + pay period combo
router.delete("/by-employee/:employeeId/:payPeriodId", deleteTimesheetByEmployeeAndPeriod);
module.exports = router;
