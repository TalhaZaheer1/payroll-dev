const {  getCurrentPayPeriodTimesheet,deleteTimesheetEntryById,deleteTimesheetByEmployeeAndPeriod, updateTimesheetEntry, getTimesheetByPayPeriod } = require("../controllers/timesheetEntry");
const { requireAuth } = require("../middlewares/auth");

const router = require("express").Router()

router.get("/",requireAuth,getCurrentPayPeriodTimesheet);
router.put("/",requireAuth,updateTimesheetEntry);
router.get("/:payPeriodId",requireAuth,getTimesheetByPayPeriod);
router.delete("/:id",requireAuth, deleteTimesheetEntryById);

// OPTIONAL: delete by employee + pay period combo
router.delete("/by-employee/:employeeId/:payPeriodId",requireAuth, deleteTimesheetByEmployeeAndPeriod);
module.exports = router;
